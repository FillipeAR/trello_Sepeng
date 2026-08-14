/**
 * Renomeia a etapa "Obra em Execução" (key: execucao) para "Engenharia" —
 * só o nome. `displayStatus` ("Obra em Execução", o que aparece pra quem
 * acompanha a obra), `key`, departamento e tudo mais ficam como estão.
 *
 * Uso: npx tsx scripts/rename-execucao-engenharia.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createDraftVersion, publishVersion, updateStage } from "../src/modules/workflow/commands";

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

  const execucao = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "execucao" },
  });

  await updateStage(actor, {
    stageId: execucao.id,
    data: {
      name: "Engenharia",
      displayStatus: execucao.displayStatus,
      description: execucao.description,
      departmentId: execucao.departmentId,
      slaHours: execucao.slaHours,
      mode: execucao.mode,
      joinPolicy: execucao.joinPolicy,
      isInitial: execucao.isInitial,
      isFinal: execucao.isFinal,
      color: execucao.color,
      completionMode: execucao.completionMode,
      externalCompletionPath: execucao.externalCompletionPath,
      externalCompletionLabel: execucao.externalCompletionLabel,
    },
  });
  console.log(`  - Etapa "${execucao.name}" renomeada para "Engenharia".`);

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
