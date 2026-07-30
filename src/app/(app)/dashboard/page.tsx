import Link from "next/link";
import { requireActor } from "@/server/actor";
import { getDepartmentDashboard, getDirectoryDashboard } from "@/modules/dashboard/queries";
import { listMyQueue } from "@/modules/projects/queries";
import { formatHours } from "@/lib/format";

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const [directory, department, queue] = await Promise.all([
    getDirectoryDashboard(actor),
    getDepartmentDashboard(actor),
    listMyQueue(actor),
  ]);

  const maxBottleneck = Math.max(1, ...directory.bottlenecks.map((b) => b.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
        <p className="text-sm text-muted">
          Olá, {actor.userName}. Visão geral das obras da {actor.organizationName}.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Obras cadastradas" value={directory.totals.total} />
        <Stat label="Em andamento" value={directory.totals.active} />
        <Stat label="Em atraso" value={directory.totals.late} tone="warning" />
        <Stat label="Finalizadas" value={directory.totals.completed} tone="success" />
      </section>

      {department ? (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">
            Seu departamento — {department.departmentName}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted">Aguardando ação</div>
              <div className="text-2xl font-semibold">{department.waiting}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Fora do prazo</div>
              <div className="text-2xl font-semibold text-warning">{department.late}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Concluídas</div>
              <div className="text-2xl font-semibold">{department.completed}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Tempo médio na etapa</div>
              <div className="text-2xl font-semibold">{formatHours(department.avgHours)}</div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Gargalos por etapa</h2>
          <p className="mb-4 text-xs text-muted">Quantas obras estão paradas em cada etapa agora.</p>
          {directory.bottlenecks.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma obra em andamento.</p>
          ) : (
            <ul className="space-y-3">
              {directory.bottlenecks.map((b) => (
                <li key={b.name}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span>
                      {b.name}
                      {b.department ? (
                        <span className="ml-2 text-xs text-muted">{b.department}</span>
                      ) : null}
                    </span>
                    <span className="font-semibold">{b.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(b.count / maxBottleneck) * 100}%`,
                        backgroundColor: b.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Tempo médio por etapa</h2>
          <p className="mb-4 text-xs text-muted">
            Baseado nas etapas já concluídas — alimenta a análise de produtividade.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Etapa</th>
                <th className="pb-2 text-right font-medium">Média</th>
                <th className="pb-2 text-right font-medium">Amostras</th>
                <th className="pb-2 text-right font-medium">SLA estourado</th>
              </tr>
            </thead>
            <tbody>
              {directory.stageMetrics.map((m) => (
                <tr key={m.name} className="border-t border-border">
                  <td className="py-2">{m.name}</td>
                  <td className="py-2 text-right">{formatHours(m.avgHours)}</td>
                  <td className="py-2 text-right text-muted">{m.samples}</td>
                  <td className={`py-2 text-right ${m.breaches > 0 ? "text-warning" : "text-muted"}`}>
                    {m.breaches}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {queue.length > 0 ? (
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Aguardando você</h2>
            <Link href="/minhas-tarefas" className="text-xs text-primary">
              Ver todas
            </Link>
          </div>
          <ul className="space-y-2">
            {queue.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/obras/${p.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-surface-muted"
                >
                  <span>
                    <span className="font-mono text-xs text-muted">{p.code}</span>{" "}
                    <span className="font-medium">{p.name}</span>
                  </span>
                  <span className={p.isLate ? "text-xs text-warning" : "text-xs text-muted"}>
                    {p.isLate ? "Atrasada" : p.displayStatus}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
