import type { Condition, StageDef, WorkflowSnapshot } from "@/core/workflow/types";
import { isValidCondition } from "@/core/workflow/conditions";
import { prisma } from "@/server/db";
import type { Tx } from "@/server/db";

/**
 * Carrega uma versão do fluxo no formato puro que o engine entende.
 * Nenhum outro lugar da aplicação lê `workflow_stages` diretamente.
 */
export async function loadSnapshot(
  versionId: string,
  client: Tx = prisma,
): Promise<WorkflowSnapshot> {
  const version = await client.workflowVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: {
          fields: { orderBy: { order: "asc" } },
          actions: { orderBy: { order: "asc" } },
        },
      },
      transitions: { orderBy: { order: "asc" } },
    },
  });

  const stages: StageDef[] = version.stages.map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    displayStatus: s.displayStatus,
    description: s.description,
    order: s.order,
    departmentId: s.departmentId,
    slaHours: s.slaHours,
    mode: s.mode,
    joinPolicy: s.joinPolicy,
    isInitial: s.isInitial,
    isFinal: s.isFinal,
    color: s.color,
    completionMode: s.completionMode,
    externalCompletionPath: s.externalCompletionPath,
    externalCompletionLabel: s.externalCompletionLabel,
    postsToJournal: s.postsToJournal,
    fields: s.fields.map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      order: f.order,
      helpText: f.helpText,
      options: (f.options as { value: string; label: string }[] | null) ?? null,
      defaultValue: f.defaultValue,
    })),
    actions: s.actions.map((a) => ({
      id: a.id,
      key: a.key,
      label: a.label,
      kind: a.kind,
      targetStageId: a.targetStageId,
      requiredPermission: a.requiredPermission,
      requiresComment: a.requiresComment,
      order: a.order,
      variant: a.variant,
    })),
  }));

  return {
    versionId: version.id,
    version: version.version,
    stages,
    transitions: version.transitions.map((t) => ({
      id: t.id,
      fromStageId: t.fromStageId,
      toStageId: t.toStageId,
      actionId: t.actionId,
      // Condição malformada no banco vira `null` — o engine cai no caminho padrão
      // em vez de estourar em produção.
      condition: isValidCondition(t.condition) ? (t.condition as Condition) : null,
      order: t.order,
    })),
  };
}

/** Versão publicada mais recente do fluxo padrão da organização. */
export async function getActiveWorkflowVersionId(
  organizationId: string,
  client: Tx = prisma,
): Promise<string> {
  const version = await client.workflowVersion.findFirst({
    where: {
      organizationId,
      status: "PUBLISHED",
      definition: { isDefault: true, deletedAt: null },
    },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (!version) {
    throw new Error(
      "Nenhuma versão publicada do fluxo padrão. Rode `npm run db:seed`.",
    );
  }

  return version.id;
}
