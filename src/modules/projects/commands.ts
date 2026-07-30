import { z } from "zod";
import { canTransition, computeDueDate, getInitialStage } from "@/core/workflow/engine";
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
  actionKey: string;
  fieldValues: Record<string, unknown>;
  comment?: string | null;
}

/**
 * Command handler central: autoriza → valida → aplica → audita → emite evento.
 * Toda mudança de etapa do sistema passa por aqui, sem exceção.
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
  if (!instance.currentStageId) {
    throw new CommandError("Esta obra já foi encerrada.", {
      errors: ["O fluxo desta obra não possui etapa ativa."],
    });
  }

  const snapshot = await loadSnapshot(instance.workflowVersionId);

  const decision = canTransition({
    snapshot,
    currentStageId: instance.currentStageId,
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

  const currentStage = snapshot.stages.find((s) => s.id === instance.currentStageId)!;
  const action = decision.action;
  const targetStage = decision.targetStage ?? null;

  return prisma.$transaction(async (tx) => {
    const currentInstance = await tx.stageInstance.findFirstOrThrow({
      where: {
        projectId: project.id,
        stageId: currentStage.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      orderBy: { enteredAt: "desc" },
    });

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

    // 3. Abre a próxima etapa (ou encerra o fluxo).
    if (targetStage) {
      await tx.stageInstance.create({
        data: {
          organizationId: actor.organizationId,
          projectId: project.id,
          workflowInstanceId: instance.id,
          stageId: targetStage.id,
          status: "IN_PROGRESS",
          enteredAt: now,
          dueAt: computeDueDate(targetStage, now),
        },
      });
    }

    await tx.projectWorkflowInstance.update({
      where: { id: instance.id },
      data: {
        currentStageId: targetStage?.id ?? null,
        completedAt: targetStage ? null : now,
      },
    });

    if (!targetStage) {
      await tx.project.update({
        where: { id: project.id },
        data: { status: "COMPLETED", actualEndDate: now, progressPercent: 100 },
      });
    }

    // 4. A justificativa vira comentário na etapa — histórico de conversas.
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

    // 5. Auditoria.
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: `stage.${action.kind.toLowerCase()}`,
      entityType: "Project",
      entityId: project.id,
      summary: targetStage
        ? `${currentStage.name} → ${targetStage.name} (${action.label})`
        : `${currentStage.name} → fluxo encerrado (${action.label})`,
      before: {
        stage: currentStage.name,
        displayStatus: currentStage.displayStatus,
        stageInstanceStatus: currentInstance.status,
      },
      after: {
        stage: targetStage?.name ?? null,
        displayStatus: targetStage?.displayStatus ?? "Fluxo encerrado",
        stageInstanceStatus: closed.status,
      },
    });

    // 6. Evento de domínio — notificações saem daqui, fora da transação.
    const eventType =
      action.kind === "RETURN"
        ? DOMAIN_EVENTS.STAGE_RETURNED
        : action.kind === "REJECT"
          ? DOMAIN_EVENTS.PROJECT_REJECTED
          : targetStage
            ? DOMAIN_EVENTS.STAGE_ENTERED
            : DOMAIN_EVENTS.PROJECT_FINISHED;

    await enqueueEvent(tx, {
      organizationId: actor.organizationId,
      type: eventType,
      payload: {
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code,
        fromStageName: currentStage.name,
        stageId: targetStage?.id ?? null,
        stageName: targetStage?.name ?? null,
        departmentId: targetStage?.departmentId ?? null,
        displayStatus: targetStage?.displayStatus ?? "Obra Finalizada",
        actorName: actor.userName,
      },
      idempotencyKey: `${eventType}:${currentInstance.id}:${action.key}`,
    });

    return { projectId: project.id, targetStage };
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
