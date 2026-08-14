/**
 * Documento por área — item do checklist da Sepeng. Um campo FILE por
 * etapa (upload real pro Vercel Blob, privado — mesmo mecanismo de
 * "Upload real de anexos"): Qualidade → PQO, Meio Ambiente → PGRCC,
 * Segurança → PGR. RH ainda não entra: quais documentos exigir lá segue em
 * aberto no checklist.
 *
 * Uso: npx tsx scripts/add-area-documents.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createDraftVersion, createField, publishVersion } from "../src/modules/workflow/commands";

const DOCUMENTS = [
  {
    stageKey: "qualidade",
    label: "PQO — Plano de Qualidade da Obra",
    helpText: "Plano de Qualidade da Obra.",
  },
  {
    stageKey: "meio_ambiente",
    label: "PGRCC — Programa de Gerenciamento de Resíduos da Construção Civil",
    helpText: "Programa de Gerenciamento de Resíduos da Construção Civil.",
  },
  {
    stageKey: "seguranca",
    label: "PGR — Programa de Gerenciamento de Riscos",
    helpText: "Programa de Gerenciamento de Riscos.",
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

  for (const doc of DOCUMENTS) {
    const stage = await prisma.workflowStage.findFirstOrThrow({
      where: { versionId: draft.id, key: doc.stageKey },
    });

    await createField(actor, {
      stageId: stage.id,
      data: {
        label: doc.label,
        type: "FILE",
        required: true,
        helpText: doc.helpText,
      },
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
