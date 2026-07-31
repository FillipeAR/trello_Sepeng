import Link from "next/link";
import { requireActor } from "@/server/actor";
import { listMyReminders } from "@/modules/tasks/queries";
import { RemindersList } from "./RemindersList";

export default async function LembretesPage() {
  const actor = await requireActor();
  const reminders = await listMyReminders(actor);

  const overdue = reminders.filter((r) => r.dueAt && r.dueAt < new Date());
  const rest = reminders.filter((r) => !overdue.includes(r));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lembretes</h1>
        <p className="text-sm text-muted">
          Pendências pontuais atribuídas a você ou criadas por você, em todas as obras.
        </p>
      </div>

      {reminders.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm font-medium">Nenhum lembrete em aberto.</p>
          <p className="mt-1 text-sm text-muted">
            Crie um lembrete direto na página de qualquer obra.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">
                Vencidos ({overdue.length})
              </h2>
              <RemindersList reminders={overdue} />
            </section>
          ) : null}

          <section>
            {overdue.length > 0 ? (
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Demais lembretes
              </h2>
            ) : null}
            <RemindersList reminders={rest} />
          </section>
        </div>
      )}

      <p className="text-xs text-muted">
        Veja também <Link href="/minhas-tarefas" className="text-primary hover:underline">Minhas tarefas</Link> —
        obras aguardando sua ação no fluxo.
      </p>
    </div>
  );
}
