/**
 * Rebinda as transições de bifurcação da Diretoria (Segurança/RH/Qualidade/
 * Meio Ambiente/ADM) à ação "avancar" — corrige o efeito de uma clonagem
 * de rascunho anterior (`createDraftVersion` zerava `actionId` em toda
 * transição clonada, ver fix nesse mesmo arquivo/commit), que deixava as 5
 * transições como "qualquer ação" e fazia "Devolver ao Orçamento" cair na
 * primeira delas por ordem (Segurança do Trabalho) em vez do Orçamento.
 *
 * Idempotente: se as transições já estiverem amarradas a "avancar", não
 * faz nada.
 *
 * Uso:
 *   npx tsx scripts/fix-diretoria-devolver-transition.ts             # local
 *   DATABASE_URL="<neon>" npx tsx scripts/fix-diretoria-devolver-transition.ts  # produção
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createDraftVersion, publishVersion, updateTransition } from "../src/modules/workflow/commands";

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
  const avancar = diretoria.actions.find((a) => a.key === "avancar");
  if (!avancar) throw new Error('Ação "avancar" não encontrada na Diretoria deste rascunho.');

  const transitions = await prisma.workflowTransition.findMany({
    where: { fromStageId: diretoria.id },
    include: { toStage: { select: { name: true } } },
  });

  let fixed = 0;
  for (const t of transitions) {
    if (t.actionId === avancar.id) continue;
    await updateTransition(actor, {
      transitionId: t.id,
      data: { toStageId: t.toStageId, actionId: avancar.id, conditionOp: "always", conditionPath: null, conditionValue: null },
    });
    console.log(`  Diretoria → ${t.toStage.name}: actionId amarrado a "avancar".`);
    fixed += 1;
  }

  if (fixed === 0) {
    console.log("Nada a corrigir — todas as transições já estavam amarradas a \"avancar\".");
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
