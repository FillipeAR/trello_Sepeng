import { z } from "zod";
import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS, PERMISSION_CATALOG } from "@/core/rbac/permissions";
import { Prisma } from "@/generated/prisma/client";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";

/**
 * Command handlers do editor de fluxos. Só existe uma regra: nada aqui
 * escreve numa versão que não seja DRAFT. Uma vez publicada, a versão é
 * imutável — mudar o fluxo é sempre criar/editar um rascunho e publicá-lo
 * como a próxima versão.
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.WORKFLOW_MANAGE)) {
    throw new CommandError("Você não tem permissão para configurar o fluxo.", {
      errors: ["Permissão workflow:manage ausente."],
    });
  }
}

function slugify(text: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "item";
}

async function uniqueKey(
  tx: Tx,
  exists: (key: string) => Promise<boolean>,
  base: string,
): Promise<string> {
  const root = slugify(base);
  let key = root;
  let n = 2;
  while (await exists(key)) {
    key = `${root}_${n++}`;
  }
  return key;
}

async function getDraftVersion(tx: Tx, organizationId: string, versionId: string) {
  const version = await tx.workflowVersion.findFirst({
    where: { id: versionId, organizationId },
  });
  if (!version) {
    throw new CommandError("Versão do fluxo não encontrada.", { errors: ["Versão inexistente."] });
  }
  if (version.status !== "DRAFT") {
    throw new CommandError("Esta versão não pode ser editada.", {
      errors: ["Apenas versões em rascunho podem ser editadas — versões publicadas são imutáveis."],
    });
  }
  return version;
}

async function getStageInDraft(tx: Tx, organizationId: string, stageId: string) {
  const stage = await tx.workflowStage.findFirst({ where: { id: stageId, organizationId } });
  if (!stage) {
    throw new CommandError("Etapa não encontrada.", { errors: ["Etapa inexistente."] });
  }
  const version = await getDraftVersion(tx, organizationId, stage.versionId);
  return { stage, version };
}

// --- Rascunho ----------------------------------------------------------------

export async function createDraftVersion(actor: SessionContext, input: { definitionId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const definition = await tx.workflowDefinition.findFirst({
      where: { id: input.definitionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!definition) {
      throw new CommandError("Fluxo não encontrado.", { errors: ["Fluxo inexistente."] });
    }

    const existingDraft = await tx.workflowVersion.findFirst({
      where: { definitionId: definition.id, status: "DRAFT" },
    });
    if (existingDraft) return existingDraft;

    const latest = await tx.workflowVersion.findFirst({
      where: { definitionId: definition.id },
      orderBy: { version: "desc" },
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: { fields: { orderBy: { order: "asc" } }, actions: { orderBy: { order: "asc" } } },
        },
        transitions: { orderBy: { order: "asc" } },
      },
    });

    const nextVersion = (latest?.version ?? 0) + 1;
    const draft = await tx.workflowVersion.create({
      data: {
        organizationId: actor.organizationId,
        definitionId: definition.id,
        version: nextVersion,
        status: "DRAFT",
        notes: latest ? `Rascunho a partir da v${latest.version}.` : "Novo rascunho.",
      },
    });

    if (latest) {
      const stageIdMap = new Map<string, string>();

      for (const stage of latest.stages) {
        const created = await tx.workflowStage.create({
          data: {
            organizationId: actor.organizationId,
            versionId: draft.id,
            key: stage.key,
            name: stage.name,
            displayStatus: stage.displayStatus,
            description: stage.description,
            order: stage.order,
            departmentId: stage.departmentId,
            slaHours: stage.slaHours,
            mode: stage.mode,
            joinPolicy: stage.joinPolicy,
            isInitial: stage.isInitial,
            isFinal: stage.isFinal,
            color: stage.color,
            icon: stage.icon,
          },
        });
        stageIdMap.set(stage.id, created.id);

        for (const field of stage.fields) {
          await tx.stageField.create({
            data: {
              organizationId: actor.organizationId,
              stageId: created.id,
              key: field.key,
              label: field.label,
              type: field.type,
              required: field.required,
              order: field.order,
              helpText: field.helpText,
              options: field.options ?? undefined,
              defaultValue: field.defaultValue ?? undefined,
            },
          });
        }
      }

      // Segunda passada: as ações só podem apontar para etapas que já existam.
      for (const stage of latest.stages) {
        for (const action of stage.actions) {
          await tx.stageAction.create({
            data: {
              organizationId: actor.organizationId,
              stageId: stageIdMap.get(stage.id)!,
              key: action.key,
              label: action.label,
              kind: action.kind,
              targetStageId: action.targetStageId
                ? (stageIdMap.get(action.targetStageId) ?? null)
                : null,
              requiredPermission: action.requiredPermission,
              requiresComment: action.requiresComment,
              order: action.order,
              variant: action.variant,
            },
          });
        }
      }

      for (const transition of latest.transitions) {
        await tx.workflowTransition.create({
          data: {
            organizationId: actor.organizationId,
            versionId: draft.id,
            fromStageId: stageIdMap.get(transition.fromStageId)!,
            toStageId: stageIdMap.get(transition.toStageId)!,
            // A ação de origem pertence à versão antiga — a transição clonada
            // passa a valer para qualquer ação da etapa até ser reconfigurada.
            actionId: null,
            condition: transition.condition ?? undefined,
            order: transition.order,
          },
        });
      }
    }

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.draft.created",
      entityType: "WorkflowVersion",
      entityId: draft.id,
      summary: latest
        ? `Rascunho v${nextVersion} criado a partir da v${latest.version}.`
        : `Rascunho v${nextVersion} criado do zero.`,
    });

    return draft;
  });
}

export async function updateVersionNotes(actor: SessionContext, input: { versionId: string; notes: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const version = await getDraftVersion(tx, actor.organizationId, input.versionId);
    return tx.workflowVersion.update({ where: { id: version.id }, data: { notes: input.notes || null } });
  });
}

export async function discardDraft(actor: SessionContext, input: { versionId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const version = await getDraftVersion(tx, actor.organizationId, input.versionId);
    await tx.workflowVersion.delete({ where: { id: version.id } });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.draft.discarded",
      entityType: "WorkflowVersion",
      entityId: version.id,
      summary: `Rascunho v${version.version} descartado.`,
    });
  });
}

export async function publishVersion(actor: SessionContext, input: { versionId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const version = await getDraftVersion(tx, actor.organizationId, input.versionId);

    const stages = await tx.workflowStage.findMany({
      where: { versionId: version.id },
      orderBy: { order: "asc" },
      include: { actions: true },
    });

    if (stages.length === 0) {
      throw new CommandError("O rascunho não tem etapas.", {
        errors: ["Adicione ao menos uma etapa antes de publicar."],
      });
    }

    if (!stages.some((s) => s.isInitial)) {
      await tx.workflowStage.update({ where: { id: stages[0].id }, data: { isInitial: true } });
    }

    const brokenStages = stages.filter((s) => !s.isFinal && s.actions.length === 0);
    if (brokenStages.length > 0) {
      throw new CommandError("Existem etapas sem nenhuma ação.", {
        errors: brokenStages.map(
          (s) => `A etapa "${s.name}" não é final e não tem nenhuma ação — a obra ficaria travada nela.`,
        ),
      });
    }

    const previous = await tx.workflowVersion.findFirst({
      where: { definitionId: version.definitionId, status: "PUBLISHED" },
    });

    const published = await tx.workflowVersion.update({
      where: { id: version.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });

    if (previous) {
      await tx.workflowVersion.update({ where: { id: previous.id }, data: { status: "ARCHIVED" } });
    }

    const inFlight = previous
      ? await tx.projectWorkflowInstance.count({
          where: { workflowVersionId: previous.id, completedAt: null },
        })
      : 0;

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.version.published",
      entityType: "WorkflowVersion",
      entityId: published.id,
      summary: previous
        ? `v${published.version} publicada, substituindo v${previous.version} (${inFlight} obra(s) seguem travadas na versão anterior).`
        : `v${published.version} publicada.`,
    });

    return { published, inFlight };
  });
}

// --- Etapas --------------------------------------------------------------------

const stageSchema = z.object({
  name: z.string().min(2, "Informe o nome da etapa."),
  displayStatus: z.string().min(2, "Informe o status exibido para quem acompanha a obra."),
  description: z.string().optional().nullable(),
  departmentId: z.string().nullable().optional(),
  slaHours: z.coerce.number().int().positive().nullable().optional(),
  mode: z.enum(["SEQUENTIAL", "PARALLEL"]).default("SEQUENTIAL"),
  joinPolicy: z.enum(["ALL", "ANY"]).default("ALL"),
  isInitial: z.boolean().default(false),
  isFinal: z.boolean().default(false),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Informe uma cor hexadecimal válida (ex.: #64748b).")
    .default("#64748b"),
});

export type StageInput = z.infer<typeof stageSchema>;

export async function createStage(actor: SessionContext, input: { versionId: string; data: unknown }) {
  requireManage(actor);
  const data = stageSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const version = await getDraftVersion(tx, actor.organizationId, input.versionId);

    const key = await uniqueKey(
      tx,
      (k) =>
        tx.workflowStage
          .findFirst({ where: { versionId: version.id, key: k }, select: { id: true } })
          .then(Boolean),
      data.name,
    );

    const maxOrder = await tx.workflowStage.aggregate({
      where: { versionId: version.id },
      _max: { order: true },
    });
    const order = (maxOrder._max.order ?? -1) + 1;

    if (data.isInitial) {
      await tx.workflowStage.updateMany({
        where: { versionId: version.id, isInitial: true },
        data: { isInitial: false },
      });
    }

    const stage = await tx.workflowStage.create({
      data: {
        organizationId: actor.organizationId,
        versionId: version.id,
        key,
        name: data.name,
        displayStatus: data.displayStatus,
        description: data.description || null,
        order,
        departmentId: data.departmentId || null,
        slaHours: data.slaHours ?? null,
        mode: data.mode,
        joinPolicy: data.joinPolicy,
        isInitial: data.isInitial,
        isFinal: data.isFinal,
        color: data.color,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.stage.created",
      entityType: "WorkflowStage",
      entityId: stage.id,
      summary: `Etapa "${stage.name}" criada no rascunho v${version.version}.`,
      after: stage,
    });

    return stage;
  });
}

export async function updateStage(actor: SessionContext, input: { stageId: string; data: unknown }) {
  requireManage(actor);
  const data = stageSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const { stage, version } = await getStageInDraft(tx, actor.organizationId, input.stageId);

    if (data.isInitial) {
      await tx.workflowStage.updateMany({
        where: { versionId: version.id, isInitial: true, id: { not: stage.id } },
        data: { isInitial: false },
      });
    }

    const updated = await tx.workflowStage.update({
      where: { id: stage.id },
      data: {
        name: data.name,
        displayStatus: data.displayStatus,
        description: data.description || null,
        departmentId: data.departmentId || null,
        slaHours: data.slaHours ?? null,
        mode: data.mode,
        joinPolicy: data.joinPolicy,
        isInitial: data.isInitial,
        isFinal: data.isFinal,
        color: data.color,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.stage.updated",
      entityType: "WorkflowStage",
      entityId: stage.id,
      summary: `Etapa "${updated.name}" atualizada.`,
      before: stage,
      after: updated,
    });

    return updated;
  });
}

export async function deleteStage(actor: SessionContext, input: { stageId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const { stage, version } = await getStageInDraft(tx, actor.organizationId, input.stageId);

    const stageCount = await tx.workflowStage.count({ where: { versionId: version.id } });
    if (stageCount <= 1) {
      throw new CommandError("O fluxo precisa de ao menos uma etapa.", {
        errors: ["Não é possível remover a única etapa do rascunho."],
      });
    }

    const referencing = await tx.stageAction.findMany({
      where: { targetStageId: stage.id },
      select: { label: true, stage: { select: { name: true } } },
    });
    if (referencing.length > 0) {
      throw new CommandError("Existem ações apontando para esta etapa.", {
        errors: referencing.map(
          (r) => `A ação "${r.label}" (etapa "${r.stage.name}") aponta para esta etapa. Ajuste-a antes de excluir.`,
        ),
      });
    }

    await tx.workflowStage.delete({ where: { id: stage.id } });

    const remaining = await tx.workflowStage.findMany({
      where: { versionId: version.id },
      orderBy: { order: "asc" },
    });
    for (const [index, s] of remaining.entries()) {
      if (s.order !== index) await tx.workflowStage.update({ where: { id: s.id }, data: { order: index } });
    }

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.stage.deleted",
      entityType: "WorkflowStage",
      entityId: stage.id,
      summary: `Etapa "${stage.name}" removida do rascunho v${version.version}.`,
      before: stage,
    });
  });
}

export async function moveStage(actor: SessionContext, input: { stageId: string; direction: "up" | "down" }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const { stage, version } = await getStageInDraft(tx, actor.organizationId, input.stageId);

    const stages = await tx.workflowStage.findMany({
      where: { versionId: version.id },
      orderBy: { order: "asc" },
    });
    const index = stages.findIndex((s) => s.id === stage.id);
    const swapIndex = input.direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= stages.length) return;

    const other = stages[swapIndex];
    await tx.workflowStage.update({ where: { id: stage.id }, data: { order: other.order } });
    await tx.workflowStage.update({ where: { id: other.id }, data: { order: stage.order } });
  });
}

// --- Campos ----------------------------------------------------------------

const fieldOptionSchema = z.object({ value: z.string().min(1), label: z.string().min(1) });

const fieldSchema = z.object({
  label: z.string().min(2, "Informe o rótulo do campo."),
  type: z.enum([
    "TEXT",
    "TEXTAREA",
    "NUMBER",
    "CURRENCY",
    "DATE",
    "SELECT",
    "MULTISELECT",
    "USER",
    "USER_MULTI",
    "CHECKBOX",
    "FILE",
  ]),
  required: z.boolean().default(false),
  helpText: z.string().optional().nullable(),
  options: z.array(fieldOptionSchema).nullable().optional(),
});

export type FieldInput = z.infer<typeof fieldSchema>;

/** "valor:Rótulo" por linha → [{ value, label }]. Usado por SELECT/MULTISELECT. */
export function parseFieldOptions(raw: string | null | undefined): { value: string; label: string }[] | null {
  if (!raw || !raw.trim()) return null;
  const options = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split(":");
      const label = rest.join(":").trim();
      return { value: value.trim(), label: label || value.trim() };
    })
    .filter((o) => o.value);
  return options.length > 0 ? options : null;
}

export async function createField(actor: SessionContext, input: { stageId: string; data: unknown }) {
  requireManage(actor);
  const data = fieldSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const { stage } = await getStageInDraft(tx, actor.organizationId, input.stageId);

    const key = await uniqueKey(
      tx,
      (k) =>
        tx.stageField.findFirst({ where: { stageId: stage.id, key: k }, select: { id: true } }).then(Boolean),
      data.label,
    );

    const maxOrder = await tx.stageField.aggregate({ where: { stageId: stage.id }, _max: { order: true } });
    const order = (maxOrder._max.order ?? -1) + 1;

    const field = await tx.stageField.create({
      data: {
        organizationId: actor.organizationId,
        stageId: stage.id,
        key,
        label: data.label,
        type: data.type,
        required: data.required,
        order,
        helpText: data.helpText || null,
        options: data.options ?? undefined,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.field.created",
      entityType: "StageField",
      entityId: field.id,
      summary: `Campo "${field.label}" criado na etapa "${stage.name}".`,
      after: field,
    });

    return field;
  });
}

export async function updateField(actor: SessionContext, input: { fieldId: string; data: unknown }) {
  requireManage(actor);
  const data = fieldSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const field = await tx.stageField.findFirst({ where: { id: input.fieldId, organizationId: actor.organizationId } });
    if (!field) throw new CommandError("Campo não encontrado.", { errors: ["Campo inexistente."] });
    const { stage } = await getStageInDraft(tx, actor.organizationId, field.stageId);

    const updated = await tx.stageField.update({
      where: { id: field.id },
      data: {
        label: data.label,
        type: data.type,
        required: data.required,
        helpText: data.helpText || null,
        options: data.options ?? undefined,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.field.updated",
      entityType: "StageField",
      entityId: field.id,
      summary: `Campo "${updated.label}" atualizado na etapa "${stage.name}".`,
      before: field,
      after: updated,
    });

    return updated;
  });
}

export async function deleteField(actor: SessionContext, input: { fieldId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const field = await tx.stageField.findFirst({ where: { id: input.fieldId, organizationId: actor.organizationId } });
    if (!field) throw new CommandError("Campo não encontrado.", { errors: ["Campo inexistente."] });
    const { stage } = await getStageInDraft(tx, actor.organizationId, field.stageId);

    await tx.stageField.delete({ where: { id: field.id } });

    const remaining = await tx.stageField.findMany({ where: { stageId: stage.id }, orderBy: { order: "asc" } });
    for (const [index, f] of remaining.entries()) {
      if (f.order !== index) await tx.stageField.update({ where: { id: f.id }, data: { order: index } });
    }

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.field.deleted",
      entityType: "StageField",
      entityId: field.id,
      summary: `Campo "${field.label}" removido da etapa "${stage.name}".`,
      before: field,
    });
  });
}

export async function moveField(actor: SessionContext, input: { fieldId: string; direction: "up" | "down" }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const field = await tx.stageField.findFirst({ where: { id: input.fieldId, organizationId: actor.organizationId } });
    if (!field) throw new CommandError("Campo não encontrado.", { errors: ["Campo inexistente."] });
    await getStageInDraft(tx, actor.organizationId, field.stageId);

    const fields = await tx.stageField.findMany({ where: { stageId: field.stageId }, orderBy: { order: "asc" } });
    const index = fields.findIndex((f) => f.id === field.id);
    const swapIndex = input.direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= fields.length) return;

    const other = fields[swapIndex];
    await tx.stageField.update({ where: { id: field.id }, data: { order: other.order } });
    await tx.stageField.update({ where: { id: other.id }, data: { order: field.order } });
  });
}

// --- Ações -------------------------------------------------------------------

const actionSchema = z.object({
  label: z.string().min(2, "Informe o rótulo da ação."),
  kind: z.enum(["ADVANCE", "RETURN", "REJECT", "FINISH"]),
  targetStageId: z.string().nullable().optional(),
  requiredPermission: z.string().nullable().optional(),
  requiresComment: z.boolean().default(false),
  variant: z.enum(["primary", "secondary", "danger"]).default("primary"),
});

export type ActionInput = z.infer<typeof actionSchema>;

async function validateActionData(
  tx: Tx,
  versionId: string,
  data: ActionInput,
) {
  if ((data.kind === "RETURN" || data.kind === "REJECT") && !data.targetStageId) {
    throw new CommandError("Ações de devolução ou reprovação exigem uma etapa de destino.", {
      errors: ["Selecione para qual etapa a obra volta."],
    });
  }

  if (data.targetStageId) {
    const target = await tx.workflowStage.findFirst({
      where: { id: data.targetStageId, versionId },
      select: { id: true },
    });
    if (!target) {
      throw new CommandError("Etapa de destino inválida.", {
        errors: ["A etapa de destino não pertence a este rascunho."],
      });
    }
  }

  if (data.requiredPermission) {
    const known = PERMISSION_CATALOG.some((p) => p.key === data.requiredPermission);
    if (!known) {
      throw new CommandError("Permissão inválida.", { errors: ["Selecione uma permissão da lista."] });
    }
  }
}

export async function createAction(actor: SessionContext, input: { stageId: string; data: unknown }) {
  requireManage(actor);
  const data = actionSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const { stage, version } = await getStageInDraft(tx, actor.organizationId, input.stageId);
    await validateActionData(tx, version.id, data);

    const key = await uniqueKey(
      tx,
      (k) =>
        tx.stageAction.findFirst({ where: { stageId: stage.id, key: k }, select: { id: true } }).then(Boolean),
      data.label,
    );

    const maxOrder = await tx.stageAction.aggregate({ where: { stageId: stage.id }, _max: { order: true } });
    const order = (maxOrder._max.order ?? -1) + 1;

    const action = await tx.stageAction.create({
      data: {
        organizationId: actor.organizationId,
        stageId: stage.id,
        key,
        label: data.label,
        kind: data.kind,
        targetStageId: data.targetStageId || null,
        requiredPermission: data.requiredPermission || null,
        requiresComment: data.requiresComment,
        order,
        variant: data.variant,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.action.created",
      entityType: "StageAction",
      entityId: action.id,
      summary: `Ação "${action.label}" criada na etapa "${stage.name}".`,
      after: action,
    });

    return action;
  });
}

export async function updateAction(actor: SessionContext, input: { actionId: string; data: unknown }) {
  requireManage(actor);
  const data = actionSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const action = await tx.stageAction.findFirst({
      where: { id: input.actionId, organizationId: actor.organizationId },
    });
    if (!action) throw new CommandError("Ação não encontrada.", { errors: ["Ação inexistente."] });
    const { stage, version } = await getStageInDraft(tx, actor.organizationId, action.stageId);
    await validateActionData(tx, version.id, data);

    const updated = await tx.stageAction.update({
      where: { id: action.id },
      data: {
        label: data.label,
        kind: data.kind,
        targetStageId: data.targetStageId || null,
        requiredPermission: data.requiredPermission || null,
        requiresComment: data.requiresComment,
        variant: data.variant,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.action.updated",
      entityType: "StageAction",
      entityId: action.id,
      summary: `Ação "${updated.label}" atualizada na etapa "${stage.name}".`,
      before: action,
      after: updated,
    });

    return updated;
  });
}

export async function deleteAction(actor: SessionContext, input: { actionId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const action = await tx.stageAction.findFirst({
      where: { id: input.actionId, organizationId: actor.organizationId },
    });
    if (!action) throw new CommandError("Ação não encontrada.", { errors: ["Ação inexistente."] });
    const { stage } = await getStageInDraft(tx, actor.organizationId, action.stageId);

    await tx.stageAction.delete({ where: { id: action.id } });

    const remaining = await tx.stageAction.findMany({ where: { stageId: stage.id }, orderBy: { order: "asc" } });
    for (const [index, a] of remaining.entries()) {
      if (a.order !== index) await tx.stageAction.update({ where: { id: a.id }, data: { order: index } });
    }

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.action.deleted",
      entityType: "StageAction",
      entityId: action.id,
      summary: `Ação "${action.label}" removida da etapa "${stage.name}".`,
      before: action,
    });
  });
}

export async function moveAction(actor: SessionContext, input: { actionId: string; direction: "up" | "down" }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const action = await tx.stageAction.findFirst({
      where: { id: input.actionId, organizationId: actor.organizationId },
    });
    if (!action) throw new CommandError("Ação não encontrada.", { errors: ["Ação inexistente."] });
    await getStageInDraft(tx, actor.organizationId, action.stageId);

    const actions = await tx.stageAction.findMany({ where: { stageId: action.stageId }, orderBy: { order: "asc" } });
    const index = actions.findIndex((a) => a.id === action.id);
    const swapIndex = input.direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= actions.length) return;

    const other = actions[swapIndex];
    await tx.stageAction.update({ where: { id: action.id }, data: { order: other.order } });
    await tx.stageAction.update({ where: { id: other.id }, data: { order: action.order } });
  });
}

// --- Transições ----------------------------------------------------------------

const conditionOpSchema = z.enum([
  "always",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "nin",
  "isEmpty",
  "isNotEmpty",
]);

const transitionSchema = z.object({
  toStageId: z.string().min(1, "Selecione a etapa de destino."),
  actionId: z.string().nullable().optional(),
  conditionOp: conditionOpSchema.default("always"),
  conditionPath: z.string().nullable().optional(),
  conditionValue: z.string().nullable().optional(),
});

export type TransitionInput = z.infer<typeof transitionSchema>;

/**
 * Monta o JSON de `condition` (avaliado por src/core/workflow/conditions.ts) a
 * partir dos campos simples do formulário. V1 do editor não expõe and/or/not —
 * uma única comparação por transição já cobre bifurcação e condição de rota.
 */
function buildCondition(data: TransitionInput): Prisma.InputJsonValue | null {
  const { conditionOp: op, conditionPath, conditionValue } = data;
  if (op === "always") return null;

  const path = (conditionPath ?? "").trim();
  if (!path) {
    throw new CommandError("Informe o campo avaliado pela condição.", {
      errors: ['Toda condição (exceto "sempre") precisa de um campo — ex.: "project.contractValue".'],
    });
  }

  if (op === "isEmpty" || op === "isNotEmpty") return { op, path };

  if (op === "in" || op === "nin") {
    const value = (conditionValue ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (value.length === 0) {
      throw new CommandError("Informe ao menos um valor para a lista.", {
        errors: ["Separe os valores por vírgula."],
      });
    }
    return { op, path, value };
  }

  const raw = (conditionValue ?? "").trim();
  if (!raw) {
    throw new CommandError("Informe o valor de comparação da condição.", {
      errors: ["O valor não pode ficar em branco."],
    });
  }
  const value: string | number = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  return { op, path, value };
}

async function validateTransitionTargets(
  tx: Tx,
  versionId: string,
  fromStageId: string,
  data: TransitionInput,
) {
  const target = await tx.workflowStage.findFirst({
    where: { id: data.toStageId, versionId },
    select: { id: true },
  });
  if (!target) {
    throw new CommandError("Etapa de destino inválida.", {
      errors: ["A etapa de destino não pertence a este rascunho."],
    });
  }

  if (data.actionId) {
    const action = await tx.stageAction.findFirst({
      where: { id: data.actionId, stageId: fromStageId },
      select: { id: true },
    });
    if (!action) {
      throw new CommandError("Ação inválida.", {
        errors: ["A ação selecionada não pertence a esta etapa."],
      });
    }
  }
}

export async function createTransition(actor: SessionContext, input: { stageId: string; data: unknown }) {
  requireManage(actor);
  const data = transitionSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const { stage, version } = await getStageInDraft(tx, actor.organizationId, input.stageId);
    await validateTransitionTargets(tx, version.id, stage.id, data);
    const condition = buildCondition(data);

    const maxOrder = await tx.workflowTransition.aggregate({
      where: { fromStageId: stage.id },
      _max: { order: true },
    });
    const order = (maxOrder._max.order ?? -1) + 1;

    const transition = await tx.workflowTransition.create({
      data: {
        organizationId: actor.organizationId,
        versionId: version.id,
        fromStageId: stage.id,
        toStageId: data.toStageId,
        actionId: data.actionId || null,
        condition: condition ?? undefined,
        order,
      },
    });

    const toStage = await tx.workflowStage.findUniqueOrThrow({
      where: { id: data.toStageId },
      select: { name: true },
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.transition.created",
      entityType: "WorkflowTransition",
      entityId: transition.id,
      summary: `Transição "${stage.name}" → "${toStage.name}" criada.`,
      after: transition,
    });

    return transition;
  });
}

export async function updateTransition(actor: SessionContext, input: { transitionId: string; data: unknown }) {
  requireManage(actor);
  const data = transitionSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const transition = await tx.workflowTransition.findFirst({
      where: { id: input.transitionId, organizationId: actor.organizationId },
    });
    if (!transition) throw new CommandError("Transição não encontrada.", { errors: ["Transição inexistente."] });
    const { stage, version } = await getStageInDraft(tx, actor.organizationId, transition.fromStageId);
    await validateTransitionTargets(tx, version.id, stage.id, data);
    const condition = buildCondition(data);

    const updated = await tx.workflowTransition.update({
      where: { id: transition.id },
      data: {
        toStageId: data.toStageId,
        actionId: data.actionId || null,
        condition: condition === null ? Prisma.JsonNull : condition,
      },
    });

    const toStage = await tx.workflowStage.findUniqueOrThrow({
      where: { id: data.toStageId },
      select: { name: true },
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.transition.updated",
      entityType: "WorkflowTransition",
      entityId: transition.id,
      summary: `Transição "${stage.name}" → "${toStage.name}" atualizada.`,
      before: transition,
      after: updated,
    });

    return updated;
  });
}

export async function deleteTransition(actor: SessionContext, input: { transitionId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const transition = await tx.workflowTransition.findFirst({
      where: { id: input.transitionId, organizationId: actor.organizationId },
    });
    if (!transition) throw new CommandError("Transição não encontrada.", { errors: ["Transição inexistente."] });
    const { stage } = await getStageInDraft(tx, actor.organizationId, transition.fromStageId);

    await tx.workflowTransition.delete({ where: { id: transition.id } });

    const remaining = await tx.workflowTransition.findMany({
      where: { fromStageId: stage.id },
      orderBy: { order: "asc" },
    });
    for (const [index, t] of remaining.entries()) {
      if (t.order !== index) await tx.workflowTransition.update({ where: { id: t.id }, data: { order: index } });
    }

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "workflow.transition.deleted",
      entityType: "WorkflowTransition",
      entityId: transition.id,
      summary: `Transição removida da etapa "${stage.name}".`,
      before: transition,
    });
  });
}

export async function moveTransition(
  actor: SessionContext,
  input: { transitionId: string; direction: "up" | "down" },
) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const transition = await tx.workflowTransition.findFirst({
      where: { id: input.transitionId, organizationId: actor.organizationId },
    });
    if (!transition) throw new CommandError("Transição não encontrada.", { errors: ["Transição inexistente."] });
    await getStageInDraft(tx, actor.organizationId, transition.fromStageId);

    const transitions = await tx.workflowTransition.findMany({
      where: { fromStageId: transition.fromStageId },
      orderBy: { order: "asc" },
    });
    const index = transitions.findIndex((t) => t.id === transition.id);
    const swapIndex = input.direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= transitions.length) return;

    const other = transitions[swapIndex];
    await tx.workflowTransition.update({ where: { id: transition.id }, data: { order: other.order } });
    await tx.workflowTransition.update({ where: { id: other.id }, data: { order: transition.order } });
  });
}
