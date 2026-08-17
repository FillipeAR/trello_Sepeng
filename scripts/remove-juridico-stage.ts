/**
 * Remove a etapa "Jurídico" do fluxo local — resquício de
 * `scripts/demo-inserir-etapa.ts` (script de demonstração que provou "inserir
 * etapa é dado, não código"), nunca fez parte do fluxo pedido pela Sepeng e
 * nunca rodou em produção. Mesmo padrão draft+deleteStage+publish das outras
 * migrações de fluxo.
 *
 * Uso: npx tsx scripts/remove-juridico-stage.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createDraftVersion, deleteStage, publishVersion } from "../src/modules/workflow/commands";

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

  const juridico = await prisma.workflowStage.findFirst({
    where: { versionId: draft.id, key: "juridico" },
  });

  if (!juridico) {
    console.log('Etapa "juridico" não existe neste rascunho — nada a remover.');
  } else {
    await deleteStage(actor, { stageId: juridico.id });
    console.log(`Etapa "${juridico.name}" removida do rascunho.`);
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
