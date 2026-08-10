/**
 * A etapa Diretoria deixa de ter formulário próprio — a única exigência
 * dela passa a ser montar a equipe da obra no canvas (`/obras/[id]/equipe`).
 * Remove os dois campos restantes (`quantidade_funcionarios`,
 * `recursos_necessarios` — não fazem mais sentido como formulário se não
 * existe formulário) e liga `completionMode: "EXTERNAL"` apontando pra
 * "equipe", com o botão "Ir para Equipe da Obra". "Devolver" continua
 * disponível, sem formulário, direto na página da obra.
 *
 * Mesmo cuidado de sempre: etapa PARALLEL, reamarra as transições de
 * bifurcação à ação "avancar" antes de publicar.
 *
 * Uso: npx tsx scripts/enable-diretoria-external-completion.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createDraftVersion, deleteField, publishVersion, updateStage, updateTransition } from "../src/modules/workflow/commands";

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

  const avancar = diretoria.actions.find((a) => a.kind === "ADVANCE");
  if (avancar) {
    const transitions = await prisma.workflowTransition.findMany({ where: { fromStageId: diretoria.id } });
    for (const t of transitions) {
      if (t.actionId === avancar.id) continue;
      await updateTransition(actor, {
        transitionId: t.id,
        data: { toStageId: t.toStageId, actionId: avancar.id, conditionOp: "always", conditionPath: null, conditionValue: null },
      });
      console.log(`  Transição ${t.id} reamarrada à ação "avancar" da Diretoria.`);
    }
  }

  for (const key of ["quantidade_funcionarios", "recursos_necessarios"]) {
    const field = diretoria.fields.find((f) => f.key === key);
    if (!field) {
      console.warn(`  ! Campo "${key}" não encontrado em Diretoria, pulando.`);
      continue;
    }
    await deleteField(actor, { fieldId: field.id });
    console.log(`  - Campo "${field.label}" (${key}) removido de Diretoria.`);
  }

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
    },
  });
  console.log(`  - Diretoria: completionMode = EXTERNAL, redireciona pra "equipe".`);

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
