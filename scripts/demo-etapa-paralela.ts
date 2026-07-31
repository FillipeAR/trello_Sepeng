/**
 * Demonstração de etapas paralelas: prova que "bifurcar e convergir" também
 * é DADO, não código.
 *
 * Publica uma nova versão em que Diretoria vira uma etapa PARALLEL — ao
 * aprovar o planejamento, RH e Segurança do Trabalho passam a rodar ao
 * mesmo tempo, cada um com sua própria fila e SLA. Financeiro só libera
 * quando os dois (joinPolicy ALL) tiverem concluído.
 *
 * Nenhuma linha de código da aplicação muda — só dado: `mode: PARALLEL` na
 * Diretoria, duas `WorkflowTransition` saindo dela, e os `targetStageId` de
 * RH/Segurança apontando para Financeiro.
 *
 * Uso: npx tsx scripts/demo-etapa-paralela.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sepeng" } });

  const definition = await prisma.workflowDefinition.findFirstOrThrow({
    where: { organizationId: org.id, isDefault: true },
  });

  const latest = await prisma.workflowVersion.findFirstOrThrow({
    where: { definitionId: definition.id, status: "PUBLISHED" },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: { fields: { orderBy: { order: "asc" } }, actions: { orderBy: { order: "asc" } } },
      },
    },
  });

  console.log(`Versão atual: v${latest.version} com ${latest.stages.length} etapas.`);

  const [diretoria, rh, seguranca] = ["diretoria", "rh", "seguranca"].map(
    (key) => latest.stages.find((s) => s.key === key)!,
  );
  if (!diretoria || !rh || !seguranca) {
    throw new Error("Fluxo atual não tem as etapas diretoria/rh/seguranca esperadas.");
  }

  const nextVersion = latest.version + 1;
  const created = await prisma.workflowVersion.create({
    data: {
      organizationId: org.id,
      definitionId: definition.id,
      version: nextVersion,
      status: "PUBLISHED",
      publishedAt: new Date(),
      notes: "Diretoria vira bifurcação: RH e Segurança rodam em paralelo, convergindo em Financeiro.",
    },
  });

  // RH e Segurança passam a ter a MESMA ordem (rodam ao mesmo tempo); tudo
  // que vem depois de Financeiro desloca +1 pra abrir espaço.
  const newOrderByKey = new Map<string, number>();
  let cursor = 0;
  for (const stage of latest.stages) {
    if (stage.key === "rh" || stage.key === "seguranca") continue; // tratados à parte
    newOrderByKey.set(stage.key, cursor);
    if (stage.key === "diretoria") {
      newOrderByKey.set("rh", cursor + 1);
      newOrderByKey.set("seguranca", cursor + 1);
      cursor += 2;
    } else {
      cursor += 1;
    }
  }

  const novosIds = new Map<string, string>();

  for (const stage of latest.stages) {
    const isDiretoria = stage.key === "diretoria";
    const novo = await prisma.workflowStage.create({
      data: {
        organizationId: org.id,
        versionId: created.id,
        key: stage.key,
        name: stage.name,
        displayStatus: stage.displayStatus,
        description: stage.description,
        order: newOrderByKey.get(stage.key)!,
        departmentId: stage.departmentId,
        slaHours: stage.slaHours,
        mode: isDiretoria ? "PARALLEL" : stage.mode,
        joinPolicy: stage.joinPolicy,
        color: stage.color,
        isInitial: stage.isInitial,
        isFinal: stage.isFinal,
        fields: {
          create: stage.fields.map((f, i) => ({
            organizationId: org.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            order: i,
            helpText: f.helpText,
            options: f.options ?? undefined,
            defaultValue: f.defaultValue ?? undefined,
          })),
        },
      },
    });
    novosIds.set(stage.key, novo.id);
  }

  // Ações: mesma lógica de sempre, exceto RH e Segurança, que agora
  // apontam explicitamente para Financeiro (não dá mais pra confiar na
  // "próxima etapa por order" — as duas dividem a mesma posição).
  for (const stage of latest.stages) {
    for (const [i, action] of stage.actions.entries()) {
      const targetKey = action.targetStageId
        ? latest.stages.find((s) => s.id === action.targetStageId)?.key
        : null;

      const explicitTargetKey =
        (stage.key === "rh" || stage.key === "seguranca") && action.kind === "ADVANCE"
          ? "financeiro"
          : targetKey;

      await prisma.stageAction.create({
        data: {
          organizationId: org.id,
          stageId: novosIds.get(stage.key)!,
          key: action.key,
          label: action.label,
          kind: action.kind,
          targetStageId: explicitTargetKey ? novosIds.get(explicitTargetKey) : null,
          requiredPermission: action.requiredPermission,
          requiresComment: action.requiresComment,
          order: i,
          variant: action.variant,
        },
      });
    }
  }

  // A bifurcação em si: duas transições saindo de Diretoria, uma pra cada
  // ramo, as duas amarradas à ação "avancar" de Diretoria.
  const avancarDiretoria = diretoria.actions.find((a) => a.kind === "ADVANCE")!;
  const novaAcaoDiretoria = await prisma.stageAction.findFirstOrThrow({
    where: { stageId: novosIds.get("diretoria")!, key: avancarDiretoria.key },
  });
  await prisma.workflowTransition.createMany({
    data: [
      {
        organizationId: org.id,
        versionId: created.id,
        fromStageId: novosIds.get("diretoria")!,
        toStageId: novosIds.get("rh")!,
        actionId: novaAcaoDiretoria.id,
        order: 0,
      },
      {
        organizationId: org.id,
        versionId: created.id,
        fromStageId: novosIds.get("diretoria")!,
        toStageId: novosIds.get("seguranca")!,
        actionId: novaAcaoDiretoria.id,
        order: 1,
      },
    ],
  });

  await prisma.workflowVersion.update({ where: { id: latest.id }, data: { status: "ARCHIVED" } });

  const emAndamento = await prisma.projectWorkflowInstance.count({
    where: { workflowVersionId: latest.id, completedAt: null },
  });

  console.log(`\n✔ Publicada a v${nextVersion}.`);
  console.log(`  Diretoria agora bifurca em RH + Segurança (rodam ao mesmo tempo).`);
  console.log(`  Financeiro só libera quando os dois concluírem (joinPolicy ALL).`);
  console.log(`  ${emAndamento} obra(s) em andamento seguem travadas na v${latest.version} — sem impacto.`);
  console.log(`  Obras novas entram automaticamente na v${nextVersion}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
