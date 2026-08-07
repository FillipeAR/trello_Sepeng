/**
 * Desfaz `remove-diretoria-staff-fields.ts`: recria "Gerente responsável" e
 * "Encarregado responsável" (STAFF) na etapa Diretoria — o organograma que
 * cobria essa necessidade foi removido do produto, então volta a ser
 * responsabilidade do formulário da etapa.
 *
 * Mesmo cuidado das outras migrations de fluxo: etapa PARALLEL, reamarra as
 * transições de bifurcação à ação "avancar" antes de publicar.
 *
 * Uso: npx tsx scripts/restore-diretoria-staff-fields.ts
 */
import "dotenv/config";
import {
  createDraftVersion,
  createField,
  moveField,
  publishVersion,
  updateTransition,
} from "../src/modules/workflow/commands";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";

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

  const encarregado = await createField(actor, {
    stageId: diretoria.id,
    data: { label: "Encarregado responsável", type: "STAFF", required: true },
  });
  console.log(`  + Campo "${encarregado.label}" criado.`);

  const gerente = await createField(actor, {
    stageId: diretoria.id,
    data: { label: "Gerente responsável", type: "STAFF", required: true },
  });
  console.log(`  + Campo "${gerente.label}" criado.`);

  // createField sempre acrescenta no fim — traz os dois de volta pro topo (ordem original).
  for (let i = 0; i < 5; i++) await moveField(actor, { fieldId: encarregado.id, direction: "up" });
  for (let i = 0; i < 5; i++) await moveField(actor, { fieldId: gerente.id, direction: "up" });

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
