import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/actor";
import { listAllProjectsForExport } from "@/modules/projects/queries";
import { buildProjectsCsv, type ProjectCsvRow } from "@/core/reports/projects-csv";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Exporta o mesmo conjunto de obras que `/obras` mostraria com os filtros
 * dados (`q`/`status`/`atraso`) — mesmo escopo de leitura e mesma redação de
 * valor de contrato de `listProjects`, sem permissão nova: é só outra forma
 * de olhar pro que o ator já pode ver na tela.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const items = await listAllProjectsForExport(actor, {
    search: searchParams.get("q") ?? undefined,
    status: status === "ACTIVE" || status === "COMPLETED" || status === "CANCELLED" ? status : undefined,
    onlyLate: searchParams.get("atraso") === "1",
  });

  const rows: ProjectCsvRow[] = items.map((p) => ({
    code: p.code,
    name: p.name,
    client: p.client,
    location: p.location,
    stageName: p.activeStageNames.length > 0 ? p.activeStageNames.join(", ") : "—",
    displayStatus: p.displayStatus,
    departmentName: p.departmentName ?? "—",
    progressPercent: `${p.progressPercent}%`,
    contractValue: p.contractValue !== null ? formatCurrency(p.contractValue) : "Restrito",
    plannedEndDate: formatDate(p.plannedEndDate),
    isLate: p.isLate ? "Sim" : "Não",
    manager: p.manager ?? "—",
  }));

  const csv = buildProjectsCsv(rows);
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="obras-${today}.csv"`,
    },
  });
}
