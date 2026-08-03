import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, TrendingUp, TriangleAlert } from "lucide-react";
import { requireActor } from "@/server/actor";
import { getDepartmentDashboard, getDirectoryDashboard } from "@/modules/dashboard/queries";
import { listMyQueue } from "@/modules/projects/queries";
import { listMyReminders } from "@/modules/tasks/queries";
import { formatDate, formatHours } from "@/lib/format";

function overdueBy(dueAt: Date): string {
  return formatHours((Date.now() - dueAt.getTime()) / 3_600_000);
}

const KPI_STYLES = {
  indigo: { color: "#6366F1", bg: "#EEF2FF" },
  blue: { color: "#3B82F6", bg: "#EFF6FF" },
  red: { color: "#EF4444", bg: "#FEF2F2" },
  green: { color: "#22C55E", bg: "#F0FDF4" },
} as const;

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  progress,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  tone: keyof typeof KPI_STYLES;
  progress?: number;
  href?: string;
}) {
  const { color, bg } = KPI_STYLES[tone];
  return (
    <div className="card min-w-[190px] flex-1 p-5">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-[10px]"
        style={{ background: bg }}
      >
        <Icon size={19} color={color} strokeWidth={1.75} />
      </div>
      <div className="mt-3.5 text-[13.5px] text-muted">{label}</div>
      <div className="mt-0.5 text-[28px] font-extrabold tracking-tight">{value}</div>
      {progress !== undefined ? (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: color }} />
        </div>
      ) : null}
      {href ? (
        <Link href={href} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
          Ver todas <ArrowRight size={13} />
        </Link>
      ) : null}
    </div>
  );
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const [directory, department, queue, reminders] = await Promise.all([
    getDirectoryDashboard(actor),
    getDepartmentDashboard(actor),
    listMyQueue(actor),
    listMyReminders(actor),
  ]);

  const maxBottleneck = Math.max(1, ...directory.bottlenecks.map((b) => b.count));

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Olá, {actor.userName.split(" ")[0]}! 👋</h1>
        <p className="mt-1 text-[14.5px] text-muted">
          Aqui está o resumo geral das obras da {actor.organizationName}.
        </p>
      </div>

      <section className="flex flex-wrap gap-[18px]">
        <KpiCard label="Obras cadastradas" value={directory.totals.total} icon={Building2} tone="indigo" href="/obras" />
        <KpiCard label="Em andamento" value={directory.totals.active} icon={TrendingUp} tone="blue" href="/obras" />
        <KpiCard label="Em atraso" value={directory.totals.late} icon={TriangleAlert} tone="red" href="/obras" />
        <KpiCard label="Finalizadas" value={directory.totals.completed} icon={CheckCircle2} tone="green" href="/obras" />
        <KpiCard
          label="Conclusão média"
          value={`${directory.totals.avgProgress}%`}
          icon={TrendingUp}
          tone="green"
          progress={directory.totals.avgProgress}
        />
      </section>

      {directory.slaBreaches.length > 0 ? (
        <section className="card border border-danger/20 bg-danger/[0.03] p-[22px]">
          <div className="mb-1 flex items-center gap-2">
            <TriangleAlert size={18} className="text-danger" strokeWidth={1.75} />
            <h2 className="text-base font-bold text-danger">
              SLA vencido ({directory.slaBreaches.length})
            </h2>
          </div>
          <p className="mb-4 text-xs text-muted">
            Etapas que já passaram do prazo e ainda estão em aberto — ordenadas da mais
            atrasada pra mais recente.
          </p>
          <ul className="space-y-2">
            {directory.slaBreaches.slice(0, 8).map((b, i) => (
              <li key={`${b.projectId}-${b.stageName}-${i}`}>
                <Link
                  href={`/obras/${b.projectId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-surface px-3 py-2.5 text-sm transition hover:bg-danger/5"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-muted">{b.projectCode}</span>{" "}
                    <span className="font-medium">{b.projectName}</span>
                    <span className="text-muted"> · {b.stageName}</span>
                    {b.departmentName ? (
                      <span className="text-xs text-muted"> ({b.departmentName})</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-danger">
                    {overdueBy(b.dueAt)} atrasado
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {department ? (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Seu departamento — {department.departmentName}</h2>
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

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-[22px]">
          <h2 className="text-base font-bold">Gargalos por etapa</h2>
          <p className="mb-4 mt-1 text-xs text-muted">Quantas obras estão paradas em cada etapa agora.</p>
          {directory.bottlenecks.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma obra em andamento.</p>
          ) : (
            <ul className="space-y-3">
              {directory.bottlenecks.map((b) => (
                <li key={b.name}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span>
                      {b.name}
                      {b.department ? <span className="ml-2 text-xs text-muted">{b.department}</span> : null}
                    </span>
                    <span className="font-semibold">{b.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(b.count / maxBottleneck) * 100}%`, backgroundColor: b.color }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-[22px]">
          <h2 className="text-base font-bold">Tempo médio por etapa</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
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

      <div className="grid gap-5 lg:grid-cols-2">
        {queue.length > 0 ? (
          <section className="card p-[22px]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">Aguardando você</h2>
              <Link href="/minhas-tarefas" className="text-[13px] font-semibold text-primary">
                Ver todas
              </Link>
            </div>
            <ul className="space-y-2">
              {queue.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/obras/${p.id}`}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition hover:bg-surface-muted"
                  >
                    <span>
                      <span className="font-mono text-xs text-muted">{p.code}</span>{" "}
                      <span className="font-medium">{p.name}</span>
                    </span>
                    <span className={p.isLate ? "text-xs font-semibold text-warning" : "text-xs text-muted"}>
                      {p.isLate ? "Atrasada" : p.displayStatus}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {reminders.length > 0 ? (
          <section className="card p-[22px]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">Meus lembretes</h2>
              <Link href="/lembretes" className="text-[13px] font-semibold text-primary">
                Ver todos
              </Link>
            </div>
            <ul className="space-y-2">
              {reminders.slice(0, 5).map((r) => {
                const late = Boolean(r.dueAt && r.dueAt < new Date());
                return (
                  <li key={r.id}>
                    <Link
                      href={`/obras/${r.project.id}`}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition hover:bg-surface-muted"
                    >
                      <span>
                        <span className="font-mono text-xs text-muted">{r.project.code}</span>{" "}
                        <span className="font-medium">{r.title}</span>
                      </span>
                      <span className={late ? "text-xs font-semibold text-warning" : "text-xs text-muted"}>
                        {r.dueAt ? formatDate(r.dueAt) : "Sem prazo"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
