import Link from "next/link";
import { requireActor } from "@/server/actor";
import { listProjects } from "@/modules/projects/queries";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function ObrasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; atraso?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;

  const projects = await listProjects(actor, {
    search: params.q,
    status: params.status as "ACTIVE" | "COMPLETED" | "CANCELLED" | undefined,
    onlyLate: params.atraso === "1",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Obras</h1>
          <p className="text-sm text-muted">
            {projects.length} obra(s) visíveis para o seu perfil.
          </p>
        </div>
        {actor.permissions.includes(PERMISSIONS.PROJECT_CREATE) ? (
          <Link href="/obras/cadastrar" className="btn-primary">
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
                  <td className="px-4 py-3 text-right">{formatCurrency(p.contractValue)}</td>
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
    </div>
  );
}
