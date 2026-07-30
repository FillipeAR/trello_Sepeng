import Link from "next/link";
import { requireActor } from "@/server/actor";
import { listMyQueue } from "@/modules/projects/queries";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function MinhasTarefasPage() {
  const actor = await requireActor();
  const queue = await listMyQueue(actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas tarefas</h1>
        <p className="text-sm text-muted">
          Obras paradas em uma etapa de {actor.departmentName ?? "seu departamento"}, aguardando
          sua ação.
        </p>
      </div>

      {queue.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm font-medium">Nenhuma obra aguardando você.</p>
          <p className="mt-1 text-sm text-muted">
            Assim que uma obra chegar ao seu departamento, ela aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {queue.map((p) => (
            <li key={p.id}>
              <Link
                href={`/obras/${p.id}`}
                className="card flex flex-wrap items-center justify-between gap-4 p-4 transition hover:border-primary/40"
              >
                <div>
                  <div className="font-mono text-xs text-muted">{p.code}</div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted">
                    {p.client} · {p.location}
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: `${p.stageColor}1a`, color: p.stageColor }}
                  >
                    {p.displayStatus}
                  </span>
                  <div className={`mt-1 text-xs ${p.isLate ? "text-warning" : "text-muted"}`}>
                    {p.dueAt
                      ? `Prazo da etapa: ${formatDateTime(p.dueAt)}`
                      : `Entrega prevista: ${formatDate(p.plannedEndDate)}`}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
