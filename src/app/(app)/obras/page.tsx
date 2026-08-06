import Link from "next/link";
import { requireActor } from "@/server/actor";
import { listProjects } from "@/modules/projects/queries";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { formatCurrency, formatDate } from "@/lib/format";

const PAGE_SIZE = 20;

/**
 * Monta a URL de `/obras` preservando os filtros atuais, só trocando os
 * campos passados. Sempre prefixa com `/obras` (nunca devolve só `""`) —
 * "sem parâmetro nenhum" (voltar pra página 1 sem filtro) é uma URL válida,
 * mas string vazia é falsy em JS; se o retorno fosse `""` a checagem
 * `prevHref ? ... : null` do componente escondia o link por engano.
 */
function buildQuery(base: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const merged = { ...base, ...overrides };
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) usp.set(key, value);
  }
  const qs = usp.toString();
  return qs ? `/obras?${qs}` : "/obras";
}

export default async function ObrasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; atraso?: string; cursor?: string; back?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;

  const { items: projects, nextCursor } = await listProjects(actor, {
    search: params.q,
    status: params.status as "ACTIVE" | "COMPLETED" | "CANCELLED" | undefined,
    onlyLate: params.atraso === "1",
    cursor: params.cursor,
    limit: PAGE_SIZE,
  });

  const filters = { q: params.q, status: params.status, atraso: params.atraso };

  // Pilha de cursores já visitados, pra "Página anterior" funcionar sem
  // OFFSET. "_" marca a primeira página (sem cursor nenhum) — precisa de um
  // marcador não-vazio: uma string vazia de verdade some da query string
  // (buildQuery descarta valores falsy), o que quebraria o passo página1→2.
  const FIRST_PAGE = "_";
  const backStack = params.back ? params.back.split(",") : [];
  const currentCursorForStack = params.cursor ?? FIRST_PAGE;

  const nextHref = nextCursor
    ? buildQuery(filters, { cursor: nextCursor, back: [...backStack, currentCursorForStack].join(",") })
    : null;

  const prevHref =
    backStack.length > 0
      ? buildQuery(filters, {
          cursor: backStack[backStack.length - 1] === FIRST_PAGE ? undefined : backStack[backStack.length - 1],
          back: backStack.slice(0, -1).join(","),
        })
      : null;

  const isFirstPage = backStack.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Obras</h1>
          <p className="text-sm text-muted">
            {projects.length} obra(s) nesta página
            {isFirstPage && !nextCursor ? "" : " — use a paginação abaixo pra ver mais"}.
          </p>
        </div>
        {actor.permissions.includes(PERMISSIONS.PROJECT_CREATE) ? (
          <Link href="/obras/criar" className="btn-primary">
            Nova obra
          </Link>
        ) : null}
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q}
            placeholder="Nome, cliente ou código"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="status">
            Situação
          </label>
          <select id="status" name="status" defaultValue={params.status ?? ""} className="input">
            <option value="">Todas</option>
            <option value="ACTIVE">Em andamento</option>
            <option value="COMPLETED">Finalizadas</option>
            <option value="CANCELLED">Canceladas</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="atraso" value="1" defaultChecked={params.atraso === "1"} />
          Somente atrasadas
        </label>
        <button type="submit" className="btn-ghost">
          Filtrar
        </button>
      </form>

      {projects.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          Nenhuma obra encontrada para os filtros atuais.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Obra</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Status atual</th>
                <th className="px-4 py-3 font-medium">Departamento</th>
                <th className="px-4 py-3 text-right font-medium">Contrato</th>
                <th className="px-4 py-3 text-right font-medium">Prazo</th>
                <th className="px-4 py-3 text-right font-medium">Progresso</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    <Link href={`/obras/${p.id}`}>{p.code}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/obras/${p.id}`} className="font-medium hover:text-primary">
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted">{p.location}</div>
                  </td>
                  <td className="px-4 py-3">{p.client}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: `${p.stageColor}1a`, color: p.stageColor }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: p.stageColor }}
                      />
                      {p.displayStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.departmentName ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {p.contractValue === null ? "—" : formatCurrency(p.contractValue)}
                  </td>
                  <td className={`px-4 py-3 text-right ${p.isLate ? "text-warning" : ""}`}>
                    {formatDate(p.plannedEndDate)}
                    {p.isLate ? <div className="text-[11px]">em atraso</div> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${p.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted">{p.progressPercent}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {prevHref || nextHref ? (
        <div className="flex items-center justify-between">
          {prevHref ? (
            <Link href={prevHref} className="btn-ghost text-sm">
              ← Página anterior
            </Link>
          ) : (
            <span />
          )}
          {nextHref ? (
            <Link href={nextHref} className="btn-ghost text-sm">
              Próxima página →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
