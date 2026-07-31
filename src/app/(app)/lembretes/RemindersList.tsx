"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completeTaskAction, deleteTaskAction, type ActionState } from "@/app/(app)/obras/actions";
import { formatDate } from "@/lib/format";

const initial: ActionState = {};

export interface ReminderData {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  assignee: { id: string; name: string } | null;
  project: { id: string; code: string; name: string };
}

function ReminderRow({ reminder }: { reminder: ReminderData }) {
  const [completeState, completeAction] = useActionState(completeTaskAction, initial);
  const [deleteState, deleteAction] = useActionState(deleteTaskAction, initial);
  const late = Boolean(reminder.dueAt && reminder.dueAt < new Date());

  return (
    <li className="card flex items-start gap-3 p-4">
      <form action={completeAction}>
        <input type="hidden" name="projectId" value={reminder.project.id} />
        <input type="hidden" name="taskId" value={reminder.id} />
        <button
          type="submit"
          title="Concluir lembrete"
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border text-[10px] font-bold text-transparent hover:border-primary"
        >
          ✓
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <Link href={`/obras/${reminder.project.id}`} className="text-sm font-medium hover:underline">
          {reminder.title}
        </Link>
        {reminder.description ? <p className="mt-0.5 text-xs text-muted">{reminder.description}</p> : null}
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          <span className="font-mono">{reminder.project.code}</span>
          <span>{reminder.project.name}</span>
          {reminder.assignee ? <span>Para {reminder.assignee.name}</span> : null}
          {reminder.dueAt ? (
            <span className={late ? "font-medium text-warning" : ""}>
              Prazo {formatDate(reminder.dueAt)}
              {late ? " — vencido" : ""}
            </span>
          ) : null}
        </div>
        {completeState.errors || deleteState.errors ? (
          <p className="mt-1 text-xs text-danger">
            {[...(completeState.errors ?? []), ...(deleteState.errors ?? [])].join(" ")}
          </p>
        ) : null}
      </div>

      <form action={deleteAction}>
        <input type="hidden" name="projectId" value={reminder.project.id} />
        <input type="hidden" name="taskId" value={reminder.id} />
        <button
          type="submit"
          onClick={(e) => {
            if (!window.confirm(`Remover o lembrete "${reminder.title}"?`)) e.preventDefault();
          }}
          className="text-xs text-muted hover:text-danger"
        >
          Excluir
        </button>
      </form>
    </li>
  );
}

export function RemindersList({ reminders }: { reminders: ReminderData[] }) {
  if (reminders.length === 0) return <p className="text-sm text-muted">Nada por aqui.</p>;
  return (
    <ul className="space-y-2">
      {reminders.map((r) => (
        <ReminderRow key={r.id} reminder={r} />
      ))}
    </ul>
  );
}
