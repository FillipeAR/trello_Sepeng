import { z } from "zod";
import { canTransition, computeDueDate, getInitialStage, shouldJoin } from "@/core/workflow/engine";
import type { StageDef, StageInstanceStatus } from "@/core/workflow/types";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { hasPermission } from "@/core/rbac/can";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { DOMAIN_EVENTS, enqueueEvent } from "@/server/outbox";
import { getActiveWorkflowVersionId, loadSnapshot } from "@/modules/workflow/snapshot";

export class CommandError extends Error {
  constructor(
    message: string,
    readonly details: { errors: string[]; fieldErrors?: { fieldKey: string; message: string }[] } = {
      errors: [],
    },
  ) {
    super(message);
    this.name = "CommandError";
  }
}

// --- Criar obra -------------------------------------------------------------

export const createProjectSchema = z.object({
  name: z.string().min(3, "Informe o nome da obra."),
  client: z.string().min(2, "Informe o cliente."),
  contractValue: z.coerce.number().positive("Informe um valor de contrato válido."),
  location: z.string().min(2, "Informe a localização."),
  plannedStartDate: z.coerce.date(),
  plannedEndDate: z.coerce.date(),
  scopeSummary: z.string().min(5, "Descreva o escopo resumido."),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

async function nextProjectCode(tx: Tx, organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await tx.project.count({
    where: { organizationId, code: { startsWith: `OBR-${year}-` } },
  });
  return `OBR-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Cadastra a obra e a coloca na etapa inicial do fluxo publicado.
 * A versão do fluxo fica travada na instância: publicar uma v2 amanhã não
 * altera o caminho desta obra.
 */
export async function createProject(actor: SessionContext, input: CreateProjectInput) {
  if (!hasPermission(actor, PERMISSIONS.PROJECT_CREATE)) {
    throw new CommandError("Você não tem permissão para cadastrar obras.", {
      errors: ["Permissão project:create ausente."],
    });
  }

  const data = createProjectSchema.parse(input);
  if (data.plannedEndDate < data.plannedStartDate) {
    throw new CommandError("Datas inválidas.", {
      errors: ["A data de término não pode ser anterior à de início."],
    });
  }

  const versionId = await getActiveWorkflowVersionId(actor.organizationId);
  const snapshot = await loadSnapshot(versionId);
  const initialStage = getInitialStage(snapshot);

  const project = await prisma.$transaction(async (tx) => {
    const code = await nextProjectCode(tx, actor.organizationId);

    const created = await tx.project.create({
      data: {
        organizationId: actor.organizationId,
        code,
        name: data.name,
        client: data.client,
        contractValue: data.contractValue,
        location: data.location,
        plannedStartDate: data.plannedStartDate,
        plannedEndDate: data.plannedEndDate,
        scopeSummary: data.scopeSummary,
        createdById: actor.userId,
      },
    });

    const instance = await tx.projectWorkflowInstance.create({
      data: {
        organizationId: actor.organizationId,
        projectId: created.id,
        workflowVersionId: versionId,
        currentStageId: initialStage.id,
      },
    });

    const enteredAt = new Date();
    await tx.stageInstance.create({
      data: {
        organizationId: actor.organizationId,
        projectId: created.id,
        workflowInstanceId: instance.id,
        stageId: initialStage.id,
        status: "IN_PROGRESS",
        enteredAt,
        dueAt: computeDueDate(initialStage, enteredAt),
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "project.created",
      entityType: "Project",
      entityId: created.id,
      summary: `Obra ${code} cadastrada — status "${initialStage.displayStatus}".`,
      after: created,
    });

    await enqueueEvent(tx, {
      organizationId: actor.organizationId,
      type: DOMAIN_EVENTS.PROJECT_CREATED,
      payload: {
        projectId: created.id,
        projectName: created.name,
        projectCode: code,
        stageId: initialStage.id,
        stageName: initialStage.name,
        departmentId: initialStage.departmentId,
        displayStatus: initialStage.displayStatus,
      },
      idempotencyKey: `project.created:${created.id}`,
    });

    return created;
  });

  return project;
}

// --- Executar ação da etapa -------------------------------------------------

export interface ExecuteActionInput {
  projectId: string;
  /**
   * Qual etapa está sendo concluída. Obrigatório porque a obra pode ter mais
   * de uma etapa ativa ao mesmo tempo (ramos paralelos) — não existe mais um
   * "currentStageId" único e implícito o suficiente para inferir sozinho.
   */
  stageId: string;
  actionKey: string;
  fieldValues: Record<string, unknown>;
  comment?: string | null;
}

/**
 * Command handler central: autoriza → valida → aplica → audita → emite evento.
 * Toda mudança de etapa do sistema passa por aqui, sem exceção.
 *
 * Etapas paralelas (`mode: "PARALLEL"`): ao avançar, abre um `StageInstance`
 * por ramo válido, todos com o mesmo `forkId`. Cada ramo evolui de forma
 * independente; ao concluir um ramo, só abre a etapa de convergência quando o
 * `joinPolicy` dela permitir — `ALL` espera que todo irmão (mesmo `forkId`)
 * também esteja concluído, `ANY` libera no primeiro e marca os irmãos ainda
 * abertos como `SKIPPED` (supersedidos). A posição "atual" da obra nunca é
 * mantida manualmente por caso — é sempre recalculada a partir de quais
 * `StageInstance` seguem ativas depois da escrita.
 */
export async function executeStageAction(
  actor: SessionContext,
  input: ExecuteActionInput,
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, organizationId: actor.organizationId, deletedAt: null },
    include: { workflow: true },
  });

  if (!project?.workflow) {
    throw new CommandError("Obra não encontrada.", { errors: ["Obra inexistente."] });
  }

  const instance = project.workflow;
  if (instance.completedAt) {
    throw new CommandError("Esta obra já foi encerrada.", {
      errors: ["O fluxo desta obra não possui etapa ativa."],
    });
  }

  const snapshot = await loadSnapshot(instance.workflowVersionId);

  const decision = canTransition({
    snapshot,
    currentStageId: input.stageId,
    actionKey: input.actionKey,
    actor,
    fieldValues: input.fieldValues,
    comment: input.comment,
    projectContext: {
      contractValue: Number(project.contractValue),
      status: project.status,
      progressPercent: project.progressPercent,
      plannedEndDate: project.plannedEndDate,
    },
  });

  if (!decision.allowed || !decision.action) {
    throw new CommandError("Não foi possível avançar a obra.", {
      errors: decision.errors,
      fieldErrors: decision.fieldErrors,
    });
  }

  const currentStage = snapshot.stages.find((s) => s.id === input.stageId)!;
  const action = decision.action;
  const targetStages = decision.targetStages;

  return prisma.$transaction(async (tx) => {
    const currentInstance = await tx.stageInstance.findFirst({
      where: {
        projectId: project.id,
        workflowInstanceId: instance.id,
        stageId: currentStage.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      orderBy: { enteredAt: "desc" },
    });

    if (!currentInstance) {
      throw new CommandError("Esta etapa não está mais ativa nesta obra.", {
        errors: ["A etapa já foi concluída (por você ou por um ramo paralelo) ou nunca chegou a abrir."],
      });
    }

    // 1. Persiste o que foi preenchido na etapa.
    for (const field of currentStage.fields) {
      if (!(field.key in input.fieldValues)) continue;
      await tx.stageFieldValue.upsert({
        where: {
          stageInstanceId_fieldId: {
            stageInstanceId: currentInstance.id,
            fieldId: field.id,
          },
        },
        create: {
          organizationId: actor.organizationId,
          stageInstanceId: currentInstance.id,
          fieldId: field.id,
          value: (input.fieldValues[field.key] ?? null) as never,
        },
        update: { value: (input.fieldValues[field.key] ?? null) as never },
      });
    }

    // 2. Fecha a etapa atual.
    const now = new Date();
    const closed = await tx.stageInstance.update({
      where: { id: currentInstance.id },
      data: {
        status: action.kind === "RETURN" || action.kind === "REJECT" ? "RETURNED" : "COMPLETED",
        completedAt: now,
        completedById: actor.userId,
        slaBreached: currentInstance.dueAt ? now > currentInstance.dueAt : false,
      },
    });

    // 3. Decide o que abrir a seguir.
    const openedStages: StageDef[] = [];

    const openStageInstance = async (target: StageDef, forkId: string | null) => {
      await tx.stageInstance.create({
        data: {
          organizationId: actor.organizationId,
          projectId: project.id,
          workflowInstanceId: instance.id,
          stageId: target.id,
          forkId,
          status: "IN_PROGRESS",
          enteredAt: now,
          dueAt: computeDueDate(target, now),
        },
      });
      openedStages.push(target);
    };

    if (action.kind === "ADVANCE" && targetStages.length > 1) {
      // Bifurcação: abre um StageInstance por ramo, todos com o mesmo forkId.
      const forkId = crypto.randomUUID();
      for (const target of targetStages) {
        await openStageInstance(target, forkId);
      }
    } else if (targetStages.length === 1) {
      const target = targetStages[0];

      if (action.kind === "ADVANCE" && currentInstance.forkId) {
        // Este ramo terminou dentro de uma bifurcação — só abre a etapa de
        // convergência se o joinPolicy dela já estiver satisfeito.
        const siblings = await tx.stageInstance.findMany({
          where: {
            workflowInstanceId: instance.id,
            forkId: currentInstance.forkId,
            id: { not: currentInstance.id },
          },
        });
        const siblingStatuses: StageInstanceStatus[] = [...siblings.map((s) => s.status), "COMPLETED"];

        const alreadyOpen = await tx.stageInstance.findFirst({
          where: {
            workflowInstanceId: instance.id,
            stageId: target.id,
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        });

        if (!alreadyOpen && shouldJoin(target.joinPolicy, siblingStatuses)) {
          await openStageInstance(target, null);

          if (target.joinPolicy === "ANY") {
            const stillOpen = siblings.filter((s) => s.status === "PENDING" || s.status === "IN_PROGRESS");
            for (const sibling of stillOpen) {
              await tx.stageInstance.update({
                where: { id: sibling.id },
                data: { status: "SKIPPED", completedAt: now },
              });
            }
          }
        }
        // Senão: ALL ainda esperando outro(s) ramo(s), ou um irmão já abriu
        // (ANY já disparou antes) — não há nada a abrir agora.
      } else {
        // Fluxo sequencial normal, sem bifurcação envolvida.
        await openStageInstance(target, null);
      }
    }
    // targetStages vazio (FINISH, ou etapa final sem destino): nada a abrir.

    // 4. Recalcula a posição "atual" da obra a partir das etapas realmente
    // ativas — nunca a partir do que cada ramo dessa função "acha" que fez.
    const activeInstances = await tx.stageInstance.findMany({
      where: { workflowInstanceId: instance.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
      select: { stageId: true },
    });
    const finished = activeInstances.length === 0;

    await tx.projectWorkflowInstance.update({
      where: { id: instance.id },
      data: {
        currentStageId: activeInstances.length === 1 ? activeInstances[0].stageId : null,
        completedAt: finished ? now : null,
      },
    });

    if (finished) {
      await tx.project.update({
        where: { id: project.id },
        data: { status: "COMPLETED", actualEndDate: now, progressPercent: 100 },
      });
    }

    // 5. A justificativa vira comentário na etapa — histórico de conversas.
    if (input.comment?.trim()) {
      await tx.comment.create({
        data: {
          organizationId: actor.organizationId,
          entityType: "STAGE_INSTANCE",
          entityId: currentInstance.id,
          authorId: actor.userId,
          body: input.comment.trim(),
        },
      });
    }

    // 6. Auditoria.
    const afterSummary =
      openedStages.length > 0
        ? openedStages.map((s) => s.name).join(" + ")
        : finished
          ? "fluxo encerrado"
          : "aguardando ramo(s) irmão(s)";
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: `stage.${action.kind.toLowerCase()}`,
      entityType: "Project",
      entityId: project.id,
      summary: `${currentStage.name} → ${afterSummary} (${action.label})`,
      before: {
        stage: currentStage.name,
        displayStatus: currentStage.displayStatus,
        stageInstanceStatus: currentInstance.status,
      },
      after: {
        stages: openedStages.map((s) => s.name),
        displayStatus: openedStages[0]?.displayStatus ?? (finished ? "Fluxo encerrado" : "Aguardando ramo(s) irmão(s)"),
        stageInstanceStatus: closed.status,
      },
    });

    // 7. Eventos de domínio — notificações saem daqui, fora da transação.
    if (action.kind === "RETURN" || action.kind === "REJECT") {
      const eventType = action.kind === "RETURN" ? DOMAIN_EVENTS.STAGE_RETURNED : DOMAIN_EVENTS.PROJECT_REJECTED;
      const target = openedStages[0] ?? null;
      await enqueueEvent(tx, {
        organizationId: actor.organizationId,
        type: eventType,
        payload: {
          projectId: project.id,
          projectName: project.name,
          projectCode: project.code,
          fromStageName: currentStage.name,
          stageId: target?.id ?? null,
          stageName: target?.name ?? null,
          departmentId: target?.departmentId ?? null,
          displayStatus: target?.displayStatus ?? null,
          actorName: actor.userName,
        },
        idempotencyKey: `${eventType}:${currentInstance.id}:${action.key}`,
      });
    } else {
      for (const target of openedStages) {
        await enqueueEvent(tx, {
          organizationId: actor.organizationId,
          type: DOMAIN_EVENTS.STAGE_ENTERED,
          payload: {
            projectId: project.id,
            projectName: project.name,
            projectCode: project.code,
            fromStageName: currentStage.name,
            stageId: target.id,
            stageName: target.name,
            departmentId: target.departmentId,
            displayStatus: target.displayStatus,
            actorName: actor.userName,
          },
          idempotencyKey: `${DOMAIN_EVENTS.STAGE_ENTERED}:${currentInstance.id}:${action.key}:${target.id}`,
        });
      }

      if (finished) {
        await enqueueEvent(tx, {
          organizationId: actor.organizationId,
          type: DOMAIN_EVENTS.PROJECT_FINISHED,
          payload: {
            projectId: project.id,
            projectName: project.name,
            projectCode: project.code,
            fromStageName: currentStage.name,
            stageId: null,
            stageName: null,
            departmentId: null,
            displayStatus: "Obra Finalizada",
            actorName: actor.userName,
          },
          idempotencyKey: `${DOMAIN_EVENTS.PROJECT_FINISHED}:${instance.id}`,
        });
      }
    }

    return { projectId: project.id, targetStages: openedStages };
  });
}

// --- Registro de progresso --------------------------------------------------

export const projectUpdateSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["PROGRESS", "INCIDENT", "NOTE"]),
  description: z.string().min(3, "Descreva a atualização."),
  progressPercent: z.coerce.number().int().min(0).max(100).optional(),
});

export async function registerProjectUpdate(
  actor: SessionContext,
  input: z.infer<typeof projectUpdateSchema>,
) {
  if (!hasPermission(actor, PERMISSIONS.PROJECT_UPDATE_PROGRESS)) {
    throw new CommandError("Você não tem permissão para registrar progresso.", {
      errors: ["Permissão project:update:progress ausente."],
    });
  }

  const data = projectUpdateSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirstOrThrow({
      where: { id: data.projectId, organizationId: actor.organizationId },
    });

    const update = await tx.projectUpdate.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        authorId: actor.userId,
        type: data.type,
        description: data.description,
        progressPercent: data.progressPercent,
      },
    });

    if (typeof data.progressPercent === "number") {
      await tx.project.update({
        where: { id: project.id },
        data: { progressPercent: data.progressPercent },
      });
    }

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "project.update.registered",
      entityType: "Project",
      entityId: project.id,
      summary: `Atualização registrada (${data.type}).`,
      before: { progressPercent: project.progressPercent },
      after: { progressPercent: data.progressPercent ?? project.progressPercent },
    });

    return update;
  });
}
