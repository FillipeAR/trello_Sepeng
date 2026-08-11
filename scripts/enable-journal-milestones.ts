/**
 * Liga `postsToJournal` nas etapas que hoje contam como marco natural de
 * qualquer fluxo — a etapa inicial (`isInitial`, "Obra Ganha") e a etapa
 * final (`isFinal`, "Obra Finalizada") — sem depender de `key` nenhuma
 * (dado, não hardcode de etapa). Outras etapas continuam desligadas; ligar
 * mais alguma é editar o rascunho e chamar `updateStage` de novo (o editor
 * visual ainda não expõe esse campo por clique, mesmo status de
 * `completionMode` — ver StageCard.tsx).
 *
 * Uso: npx tsx scripts/enable-journal-milestones.ts
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

  const milestones = await prisma.workflowStage.findMany({
    where: { versionId: draft.id, OR: [{ isInitial: true }, { isFinal: true }] },
  });

  for (const stage of milestones) {
    if (stage.postsToJournal) {
      console.log(`  - "${stage.name}" já estava marcada como marco, sem mudança.`);
      continue;
    }
    await updateStage(actor, {
      stageId: stage.id,
      data: {
        name: stage.name,
        displayStatus: stage.displayStatus,
        description: stage.description,
        departmentId: stage.departmentId,
        slaHours: stage.slaHours,
        mode: stage.mode,
        joinPolicy: stage.joinPolicy,
        isInitial: stage.isInitial,
        isFinal: stage.isFinal,
        color: stage.color,
        completionMode: stage.completionMode,
        externalCompletionPath: stage.externalCompletionPath,
        externalCompletionLabel: stage.externalCompletionLabel,
        postsToJournal: true,
      },
    });
    console.log(`  - "${stage.name}": postsToJournal = true.`);
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
