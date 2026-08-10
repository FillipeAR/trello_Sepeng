/**
 * Duas simplificações no fluxo padrão, na mesma versão:
 *
 * 1. Etapa Orçamento perde os campos "Documentos do contrato" e
 *    "Observações do orçamento" — o valor de contrato (o que realmente
 *    importa) já é campo do cadastro da obra, não da etapa.
 * 2. Etapa Suprimentos é removida por completo. Antes de excluir, reaponta
 *    a ação "avancar" de Financeiro (que apontava pra Suprimentos) direto
 *    pra Execução — e qualquer outra ação que porventura aponte pra
 *    Suprimentos também.
 *
 * Mesmo cuidado de sempre: etapa Diretoria é PARALLEL, reamarra as
 * transições de bifurcação à ação "avancar" antes de publicar.
 *
 * Uso: npx tsx scripts/simplify-workflow-orcamento-suprimentos.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import {
  createDraftVersion,
  deleteField,
  deleteStage,
  publishVersion,
  updateAction,
  updateTransition,
} from "../src/modules/workflow/commands";

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sepeng" } });

  const membership = await prisma.membership.findFirstOrThrow({
    where: { organizationId: org.id, user: { email: "admin@obraflow.com" } },
    include: {
      user: true,
      department: true,
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });

  const actor: SessionContext = {
    userId: membership.userId,
    organizationId: membership.organizationId,
    roleSlug: membership.role.slug,
    departmentId: membership.departmentId,
    permissions: membership.role.permissions.map((rp) => rp.permission.key),
    userName: membership.user.name,
    userEmail: membership.user.email,
    organizationName: org.name,
    departmentName: membership.department?.name ?? null,
    roleName: membership.role.name,
  };

  const definition = await prisma.workflowDefinition.findFirstOrThrow({
    where: { organizationId: org.id, isDefault: true },
  });

  const draft = await createDraftVersion(actor, { definitionId: definition.id });
  console.log(`Rascunho v${draft.version} criado (id ${draft.id}).`);

  const diretoria = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "diretoria" },
    include: { actions: true },
  });
  const avancarDiretoria = diretoria.actions.find((a) => a.kind === "ADVANCE");
  if (avancarDiretoria) {
    const transitions = await prisma.workflowTransition.findMany({ where: { fromStageId: diretoria.id } });
    for (const t of transitions) {
      if (t.actionId === avancarDiretoria.id) continue;
      await updateTransition(actor, {
        transitionId: t.id,
        data: { toStageId: t.toStageId, actionId: avancarDiretoria.id, conditionOp: "always", conditionPath: null, conditionValue: null },
      });
      console.log(`  Transição ${t.id} reamarrada à ação "avancar" da Diretoria.`);
    }
  }

  // 1. Orçamento: remove os dois campos.
  const orcamento = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "orcamento" },
    include: { fields: true },
  });
  for (const key of ["documentos", "observacoes"]) {
    const field = orcamento.fields.find((f) => f.key === key);
    if (!field) {
      console.warn(`  ! Campo "${key}" não encontrado em Orçamento, pulando.`);
      continue;
    }
    await deleteField(actor, { fieldId: field.id });
    console.log(`  - Campo "${field.label}" (${key}) removido de Orçamento.`);
  }

  // 2. Suprimentos: reaponta quem aponta pra ela, depois exclui.
  const suprimentos = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "suprimentos" },
  });
  const execucao = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "execucao" },
  });

  const pointingAtSuprimentos = await prisma.stageAction.findMany({
    where: { targetStageId: suprimentos.id },
  });
  for (const action of pointingAtSuprimentos) {
    await updateAction(actor, {
      actionId: action.id,
      data: {
        label: action.label,
        kind: action.kind,
        targetStageId: execucao.id,
        requiredPermission: action.requiredPermission,
        requiresComment: action.requiresComment,
        variant: action.variant,
      },
    });
    console.log(`  Ação "${action.label}" reapontada de Suprimentos pra Execução.`);
  }

  await deleteStage(actor, { stageId: suprimentos.id });
  console.log(`  - Etapa "Suprimentos" removida.`);

  const result = await publishVersion(actor, { versionId: draft.id });
  console.log(
    `\n✔ v${result.published.version} publicada. ${result.inFlight} obra(s) seguem travadas na versão anterior.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
