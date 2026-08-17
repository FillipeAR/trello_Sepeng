/**
 * Healthcheck estrutural do(s) fluxo(s) publicado(s) — pega o tipo de
 * regressão silenciosa já visto duas vezes em produção sem gerar nenhum
 * erro visível (completionMode "EXTERNAL" perdendo a rota, transição
 * coringa sequestrando o destino de uma ação). As checagens em si são
 * puras, em `src/core/workflow/healthcheck.ts` (com teste próprio) — este
 * script só carrega a versão publicada de cada organização via
 * `loadSnapshot` e imprime o relatório.
 *
 * Uso:
 *   npx tsx scripts/healthcheck-workflow.ts                    # local (.env)
 *   DATABASE_URL="<neon>" npx tsx scripts/healthcheck-workflow.ts   # produção
 *
 * Sai com código 1 se algum problema for encontrado (dá pra plugar num
 * cron/CI depois, se fizer sentido).
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { loadSnapshot } from "../src/modules/workflow/snapshot";
import { checkWorkflowHealth } from "../src/core/workflow/healthcheck";

async function main() {
  const versions = await prisma.workflowVersion.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      version: true,
      definition: { select: { organization: { select: { name: true, slug: true } } } },
    },
  });

  if (versions.length === 0) {
    console.log("Nenhuma WorkflowVersion publicada encontrada.");
    return;
  }

  let totalIssues = 0;

  for (const v of versions) {
    const snapshot = await loadSnapshot(v.id);
    const issues = checkWorkflowHealth(snapshot);

    console.log(`\n${v.definition.organization.name} (${v.definition.organization.slug}) — fluxo v${v.version}`);
    if (issues.length === 0) {
      console.log("  ✔ nenhum problema encontrado.");
      continue;
    }

    for (const issue of issues) {
      const icon = issue.severity === "error" ? "✗" : "⚠";
      console.log(`  ${icon} [${issue.severity}] ${issue.stageName} (${issue.stageKey}): ${issue.message}`);
    }
    totalIssues += issues.length;
  }

  console.log();
  if (totalIssues > 0) {
    console.log(`${totalIssues} problema(s) encontrado(s) no total.`);
    process.exitCode = 1;
  } else {
    console.log("Tudo certo.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
