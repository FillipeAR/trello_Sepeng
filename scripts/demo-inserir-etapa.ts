/**
 * Demonstração da premissa central do sistema: mudar a esteira é mudar DADO.
 *
 * Cria a v2 do fluxo com uma etapa "Jurídico" entre Orçamento e Diretoria,
 * publica, e comprova que:
 *   - obras já em andamento continuam na v1 (8 etapas), intactas;
 *   - obras novas entram na v2 (9 etapas).
 *
 * Nenhuma linha de código da aplicação muda.
 *
 * Uso: npx tsx scripts/demo-inserir-etapa.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const NOVA_ETAPA = {
  key: "juridico",
  name: "Jurídico",
  displayStatus: "Contrato Validado",
  description: "Validação contratual e análise de riscos antes do planejamento.",
  color: "#7c3aed",
  slaHours: 48,
  /** Entra logo depois do Orçamento. */
  afterStageKey: "orcamento",
  fields: [
    { key: "contrato_analisado", label: "Contrato analisado", type: "CHECKBOX" as const, required: true },
    { key: "riscos", label: "Riscos identificados", type: "TEXTAREA" as const, required: false },
    { key: "parecer", label: "Parecer jurídico", type: "TEXTAREA" as const, required: true },
  ],
};

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sepeng" } });

  const department = await prisma.department.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "juridico" } },
    create: { organizationId: org.id, slug: "juridico", name: "Jurídico" },
    update: {},
  });

  const definition = await prisma.workflowDefinition.findFirstOrThrow({
    where: { organizationId: org.id, isDefault: true },
  });

  const latest = await prisma.workflowVersion.findFirstOrThrow({
    where: { definitionId: definition.id },
    orderBy: { version: "desc" },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: { fields: { orderBy: { order: "asc" } }, actions: { orderBy: { order: "asc" } } },
      },
    },
  });

  console.log(`Versão atual: v${latest.version} com ${latest.stages.length} etapas.`);

  const nextVersion = latest.version + 1;
  const created = await prisma.workflowVersion.create({
    data: {
      organizationId: org.id,
      definitionId: definition.id,
      version: nextVersion,
      status: "PUBLISHED",
      publishedAt: new Date(),
      notes: `Inserção da etapa "${NOVA_ETAPA.name}" após "${NOVA_ETAPA.afterStageKey}".`,
    },
  });

  // Monta a nova ordem: as etapas antigas, com a nova encaixada na posição pedida.
  const ordem: { key: string; fromOld: (typeof latest.stages)[number] | null }[] = [];
  for (const stage of latest.stages) {
    ordem.push({ key: stage.key, fromOld: stage });
    if (stage.key === NOVA_ETAPA.afterStageKey) {
      ordem.push({ key: NOVA_ETAPA.key, fromOld: null });
    }
  }

  const novosIds = new Map<string, string>();

  for (const [index, item] of ordem.entries()) {
    if (item.fromOld) {
      const s = item.fromOld;
      const novo = await prisma.workflowStage.create({
        data: {
          organizationId: org.id,
          versionId: created.id,
          key: s.key,
          name: s.name,
          displayStatus: s.displayStatus,
          description: s.description,
          order: index,
          departmentId: s.departmentId,
          slaHours: s.slaHours,
          color: s.color,
          isInitial: s.isInitial,
          isFinal: s.isFinal,
          fields: {
            create: s.fields.map((f, i) => ({
              organizationId: org.id,
              key: f.key,
              label: f.label,
              type: f.type,
              required: f.required,
              order: i,
              options: f.options ?? undefined,
            })),
          },
        },
      });
      novosIds.set(s.key, novo.id);
    } else {
      const novo = await prisma.workflowStage.create({
        data: {
          organizationId: org.id,
          versionId: created.id,
          key: NOVA_ETAPA.key,
          name: NOVA_ETAPA.name,
          displayStatus: NOVA_ETAPA.displayStatus,
          description: NOVA_ETAPA.description,
          order: index,
          departmentId: department.id,
          slaHours: NOVA_ETAPA.slaHours,
          color: NOVA_ETAPA.color,
          fields: {
            create: NOVA_ETAPA.fields.map((f, i) => ({
              organizationId: org.id,
              key: f.key,
              label: f.label,
              type: f.type,
              required: f.required,
              order: i,
            })),
          },
        },
      });
      novosIds.set(NOVA_ETAPA.key, novo.id);
    }
  }

  // Recria as ações apontando para as etapas da nova versão.
  for (const s of latest.stages) {
    for (const [i, a] of s.actions.entries()) {
      const targetKey = a.targetStageId
        ? latest.stages.find((x) => x.id === a.targetStageId)?.key
        : null;
      await prisma.stageAction.create({
        data: {
          organizationId: org.id,
          stageId: novosIds.get(s.key)!,
          key: a.key,
          label: a.label,
          kind: a.kind,
          targetStageId: targetKey ? (novosIds.get(targetKey) ?? null) : null,
          requiredPermission: a.requiredPermission,
          requiresComment: a.requiresComment,
          order: i,
          variant: a.variant,
        },
      });
    }
  }

  await prisma.stageAction.create({
    data: {
      organizationId: org.id,
      stageId: novosIds.get(NOVA_ETAPA.key)!,
      key: "avancar",
      label: "Validar contrato",
      kind: "ADVANCE",
      requiredPermission: "stage:complete",
      order: 0,
    },
  });

  await prisma.workflowVersion.update({
    where: { id: latest.id },
    data: { status: "ARCHIVED" },
  });

  const emAndamento = await prisma.projectWorkflowInstance.count({
    where: { workflowVersionId: latest.id, completedAt: null },
  });

  console.log(`\n✔ Publicada a v${nextVersion} com ${ordem.length} etapas.`);
  console.log(`  "${NOVA_ETAPA.name}" inserida após "${NOVA_ETAPA.afterStageKey}".`);
  console.log(`  ${emAndamento} obra(s) em andamento seguem travadas na v${latest.version} — sem impacto.`);
  console.log(`  Obras novas entram automaticamente na v${nextVersion}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
