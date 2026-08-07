/**
 * Remove os campos "Gerente responsável" e "Encarregado responsável" da
 * etapa Diretoria — ficaram redundantes depois do organograma: quem ocupa
 * cada cargo na obra agora é escolhido na seção "Organograma" da própria
 * obra, não precisa mais ser digitado de novo no formulário da etapa.
 *
 * Usa os command handlers de verdade (createDraftVersion/deleteField/
 * updateTransition/publishVersion), não Prisma cru — mesmo cuidado do
 * `migrate-staff-fields.ts`: a etapa Diretoria é PARALLEL, e
 * `createDraftVersion` reseta o `actionId` das transições clonadas pra
 * null ("vale pra qualquer ação da etapa"), o que faria a transição de
 * bifurcação (ADVANCE) também casar com a ação de devolução (RETURN) e
 * mandar a obra pro ramo errado. Reamarra as transições à ação "avancar"
 * do rascunho antes de publicar.
 *
 * Uso: npx tsx scripts/remove-diretoria-staff-fields.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createDraftVersion, deleteField, publishVersion, updateTransition } from "../src/modules/workflow/commands";

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
    include: { fields: true, actions: true },
  });

  // 1. Reamarra as transições de bifurcação à ação "avancar" (ver comentário acima).
  const avancar = diretoria.actions.find((a) => a.kind === "ADVANCE");
  if (avancar) {
    const transitions = await prisma.workflowTransition.findMany({
      where: { fromStageId: diretoria.id },
      orderBy: { order: "asc" },
    });
    for (const t of transitions) {
      if (t.actionId === avancar.id) continue;
      await updateTransition(actor, {
        transitionId: t.id,
        data: {
          toStageId: t.toStageId,
          actionId: avancar.id,
          conditionOp: "always",
          conditionPath: null,
          conditionValue: null,
        },
      });
      console.log(`  Transição ${t.id} reamarrada à ação "avancar".`);
    }
  }

  // 2. Remove os dois campos STAFF, redundantes com o organograma.
  for (const key of ["gerente", "encarregado"]) {
    const field = diretoria.fields.find((f) => f.key === key);
    if (!field) {
      console.warn(`  ! Campo "${key}" não encontrado no rascunho, pulando.`);
      continue;
    }
    await deleteField(actor, { fieldId: field.id });
    console.log(`  - Campo "${field.label}" (${key}) removido.`);
  }

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
