import type { TimelineStep } from "../queries";
import { formatDateTime, formatFieldValue } from "@/lib/format";

/**
 * A peça de UX central: o "rastreamento do pedido" da obra. Cada etapa mostra
 * estado, responsável, quando entrou/saiu e o que foi preenchido.
 */
export function StageTimeline({
  steps,
  progress,
}: {
  steps: TimelineStep[];
  progress: number;
}) {
  return (
    <div className="card p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Esteira da obra</h2>
        <span className="text-xs text-muted">{progress}% do fluxo percorrido</span>
      </div>

      <div className="mb-8 h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="space-y-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const dot =
            step.state === "COMPLETED"
              ? "bg-success border-success"
              : step.state === "CURRENT"
                ? step.isLate
                  ? "bg-warning border-warning animate-pulse"
                  : "bg-primary border-primary animate-pulse"
                : step.state === "RETURNED"
                  ? "bg-danger border-danger"
                  : "bg-surface border-border";

          return (
            <li key={step.stage.id} className="relative flex gap-4 pb-6 last:pb-0">
              {!isLast ? (
                <span
                  className={`absolute left-[7px] top-5 h-full w-0.5 ${
                    step.state === "COMPLETED" ? "bg-success/40" : "bg-border"
                  }`}
                  aria-hidden
                />
              ) : null}

              <span
                className={`relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${dot}`}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-medium">{step.stage.name}</span>
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: `${step.stage.color}1a`,
                        color: step.stage.color,
                      }}
                    >
                      {step.stage.displayStatus}
                    </span>
                    {step.state === "CURRENT" ? (
                      <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-primary">
                        etapa atual
                      </span>
                    ) : null}
                    {step.state === "RETURNED" ? (
                      <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-danger">
                        devolvida
                      </span>
                    ) : null}
                  </div>

                  <div className="text-xs text-muted">
                    {step.state === "PENDING"
                      ? "Aguardando"
                      : step.completedAt
                        ? `Concluída em ${formatDateTime(step.completedAt)}`
                        : `Desde ${formatDateTime(step.enteredAt)}`}
                  </div>
                </div>

                {step.stage.description ? (
                  <p className="mt-1 text-xs text-muted">{step.stage.description}</p>
                ) : null}

                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
                  {step.completedByName ? <span>Por {step.completedByName}</span> : null}
                  {step.dueAt && step.state === "CURRENT" ? (
                    <span className={step.isLate ? "font-medium text-warning" : ""}>
                      Prazo {formatDateTime(step.dueAt)}
                      {step.isLate ? " — vencido" : ""}
                    </span>
                  ) : null}
                  {step.stage.slaHours && step.state === "PENDING" ? (
                    <span>SLA {step.stage.slaHours}h</span>
                  ) : null}
                </div>

                {step.values.length > 0 ? (
                  <dl className="mt-3 grid gap-x-6 gap-y-1 rounded-lg bg-surface-muted p-3 text-xs sm:grid-cols-2">
                    {step.values.map((v) => (
                      <div key={v.label} className="flex justify-between gap-4">
                        <dt className="text-muted">{v.label}</dt>
                        <dd className="text-right font-medium">
                          {formatFieldValue(v.value, v.type)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
