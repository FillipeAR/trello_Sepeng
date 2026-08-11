/**
 * Corrige uma regressão encontrada em produção: a etapa Diretoria tinha
 * `completionMode: "EXTERNAL"` (redireciona pro canvas de Equipe da Obra,
 * ver "Diretoria vira redirect pro canvas" no CLAUDE.md) na v8, mas voltou
 * pra "FORM" na v9 — vítima do mesmo bug de clonagem que
 * `createDraftVersion` tinha (não copiava completionMode/externalCompletionPath/
 * externalCompletionLabel), corrigido nesta mesma rodada. O fix no código
 * impede que aconteça de novo, mas não desfaz o que a v9 já tinha perdido
 * antes da correção — este script republica o valor certo.
 *
 * Uso: DATABASE_URL="<neon prod>" npx tsx scripts/fix-diretoria-completion-mode.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createDraftVersion, publishVersion, updateStage } from "../src/modules/workflow/commands";

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sepeng" } });

  const membership = await prisma.membership.findFirstOrThrow({
    where: { organizationId: org.id, role: { slug: "administrador" }, isActive: true },
    select: {
      userId: true,
      organizationId: true,
      departmentId: true,
      user: { select: { name: true, email: true } },
      department: { select: { name: true } },
      role: {
        select: {
          slug: true,
          name: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
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
  console.log(`Atuando como ${actor.userEmail} (${actor.roleSlug}).`);

  const definition = await prisma.workflowDefinition.findFirstOrThrow({
    where: { organizationId: org.id, isDefault: true },
  });

  const draft = await createDraftVersion(actor, { definitionId: definition.id });
  console.log(`Rascunho v${draft.version} criado (id ${draft.id}).`);

  const diretoria = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "diretoria" },
  });

  if (diretoria.completionMode === "EXTERNAL" && diretoria.externalCompletionPath === "equipe") {
    console.log("Diretoria já está com completionMode EXTERNAL — nada a corrigir.");
  } else {
    await updateStage(actor, {
      stageId: diretoria.id,
      data: {
        name: diretoria.name,
        displayStatus: diretoria.displayStatus,
        description: diretoria.description,
        departmentId: diretoria.departmentId,
        slaHours: diretoria.slaHours,
        mode: diretoria.mode,
        joinPolicy: diretoria.joinPolicy,
        isInitial: diretoria.isInitial,
        isFinal: diretoria.isFinal,
        color: diretoria.color,
        completionMode: "EXTERNAL",
        externalCompletionPath: "equipe",
        externalCompletionLabel: "Ir para Equipe da Obra",
        postsToJournal: diretoria.postsToJournal,
      },
    });
    console.log('Diretoria: completionMode = EXTERNAL, externalCompletionPath = "equipe".');
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
