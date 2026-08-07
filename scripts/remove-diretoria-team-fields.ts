/**
 * Remove "Gerente responsável", "Encarregado responsável" e "Equipe
 * necessária" da etapa Diretoria — a tela "Equipe da Obra"
 * (`/obras/[id]/equipe`) passa a ser o jeito real de montar a equipe, com
 * hierarquia e tudo, então esses três campos do formulário da etapa ficaram
 * redundantes de vez (dessa vez não tem volta: a versão anterior desses
 * campos só existia por não ter substituto de verdade — agora tem).
 *
 * "Quantidade de funcionários" e "Recursos necessários" continuam — não são
 * sobre "quem", são planejamento operacional.
 *
 * Mesmo cuidado das migrations de fluxo anteriores: etapa PARALLEL, reamarra
 * as transições de bifurcação à ação "avancar" antes de publicar.
 *
 * Uso: npx tsx scripts/remove-diretoria-team-fields.ts
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

  const avancar = diretoria.actions.find((a) => a.kind === "ADVANCE");
  if (avancar) {
    const transitions = await prisma.workflowTransition.findMany({ where: { fromStageId: diretoria.id } });
    for (const t of transitions) {
      if (t.actionId === avancar.id) continue;
      await updateTransition(actor, {
        transitionId: t.id,
        data: { toStageId: t.toStageId, actionId: avancar.id, conditionOp: "always", conditionPath: null, conditionValue: null },
      });
      console.log(`  Transição ${t.id} reamarrada à ação "avancar".`);
    }
  }

  for (const key of ["gerente_responsavel", "encarregado_responsavel", "equipe"]) {
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
