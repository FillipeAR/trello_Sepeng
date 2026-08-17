/**
 * Documentos por área da etapa ADM — item do checklist da Sepeng que tinha
 * ficado pendente em "Documentos por área (PQO, PGRCC, PGR)" (aquela rodada
 * cobriu só Qualidade/Meio Ambiente/Segurança). Mesmo padrão: um campo FILE
 * obrigatório por documento, draft+createField+publish.
 *
 * Uso: npx tsx scripts/add-adm-documents.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createDraftVersion, createField, publishVersion } from "../src/modules/workflow/commands";

const DOCUMENTS = [
  {
    label: "CNO — Cadastro Nacional de Obra",
    helpText: "Cadastro Nacional de Obra (Receita Federal).",
  },
  {
    label: "Comunicação Prévia",
    helpText: "Comunicação Prévia de início de obra (Ministério do Trabalho/CAIXA).",
  },
  {
    label: "Seguro",
    helpText: "Apólice de seguro da obra.",
  },
  {
    label: "PCMSO — Programa de Controle Médico de Saúde Ocupacional",
    helpText: "Programa de Controle Médico de Saúde Ocupacional.",
  },
] as const;

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

  const stage = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "adm" },
  });

  for (const doc of DOCUMENTS) {
    await createField(actor, {
      stageId: stage.id,
      data: { label: doc.label, type: "FILE", required: true, helpText: doc.helpText },
    });
    console.log(`  + Campo "${doc.label}" criado na etapa "${stage.name}".`);
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
