import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/actor";
import { getProjectAuditTrail, getProjectDetail } from "@/modules/projects/queries";
import { formatDateTime } from "@/lib/format";

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function HistoricoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;

  const detail = await getProjectDetail(actor, id);
  if (!detail) notFound();

  const trail = await getProjectAuditTrail(actor, id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-muted">{detail.project.code}</div>
          <h1 className="text-2xl font-semibold tracking-tight">Histórico completo</h1>
          <p className="text-sm text-muted">
            Cada evento registrado com autor, data, valor anterior e valor novo.
          </p>
        </div>
        <Link href={`/obras/${id}`} className="btn-ghost text-xs">
          Voltar à obra
        </Link>
      </div>

      {trail.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">Nenhum evento registrado.</div>
      ) : (
        <ol className="space-y-3">
          {trail.map((entry) => {
            const diff = (entry.diffJson ?? {}) as Record<
              string,
              { before: unknown; after: unknown }
            >;
            const changes = Object.entries(diff);

            return (
              <li key={entry.id} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[11px]">
                      {entry.action}
                    </span>
                    <span className="ml-2 text-sm font-medium">{entry.summary}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {entry.actor?.name ?? "Sistema"} · {formatDateTime(entry.createdAt)}
                  </div>
                </div>

                {changes.length > 0 ? (
                  <table className="mt-3 w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="pb-1 font-medium">Campo</th>
                        <th className="pb-1 font-medium">Valor anterior</th>
                        <th className="pb-1 font-medium">Valor novo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map(([field, change]) => (
                        <tr key={field} className="border-t border-border">
                          <td className="py-1.5 font-mono">{field}</td>
                          <td className="py-1.5 text-muted">{renderValue(change.before)}</td>
                          <td className="py-1.5 font-medium">{renderValue(change.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
