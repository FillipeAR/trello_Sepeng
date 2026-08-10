"use client";

import { useActionState, useRef } from "react";
import {
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  type ActionState,
} from "@/app/(app)/obras/actions";
import { formatDate } from "@/lib/format";

const initial: ActionState = {};

export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: Date | null;
  assignee: { id: string; name: string } | null;
  createdBy: { name: string };
}

function isLate(task: TaskData): boolean {
  return task.status === "OPEN" && Boolean(task.dueAt) && task.dueAt! < new Date();
}

function TaskRow({ projectId, task }: { projectId: string; task: TaskData }) {
  const [completeState, completeAction] = useActionState(completeTaskAction, initial);
  const [reopenState, reopenAction] = useActionState(reopenTaskAction, initial);
  const [deleteState, deleteAction] = useActionState(deleteTaskAction, initial);
  const done = task.status === "DONE";

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-3">
      <form action={done ? reopenAction : completeAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={task.id} />
        <button
          type="submit"
          title={done ? "Reabrir lembrete" : "Concluir lembrete"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
            done ? "border-success bg-success text-primary-foreground" : "border-border text-transparent hover:border-primary"
          }`}
        >
          ✓
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${done ? "text-muted line-through" : ""}`}>{task.title}</div>
        {task.description ? <p className="mt-0.5 text-xs text-muted">{task.description}</p> : null}
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          {task.assignee ? <span>Para {task.assignee.name}</span> : null}
          {task.dueAt ? (
            <span className={isLate(task) ? "font-medium text-warning" : ""}>
              Prazo {formatDate(task.dueAt)}
              {isLate(task) ? " — vencido" : ""}
            </span>
          ) : null}
          <span>Criado por {task.createdBy.name}</span>
        </div>
      </div>

      <form action={deleteAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={task.id} />
        <button
          type="submit"
          onClick={(e) => {
            if (!window.confirm(`Remover o lembrete "${task.title}"?`)) e.preventDefault();
          }}
          className="text-xs text-muted hover:text-danger"
        >
          Excluir
        </button>
      </form>

      {completeState.errors || reopenState.errors || deleteState.errors ? (
        <p className="text-xs text-danger">
          {[...(completeState.errors ?? []), ...(reopenState.errors ?? []), ...(deleteState.errors ?? [])].join(" ")}
        </p>
      ) : null}
    </li>
  );
}

function NewTaskForm({
  projectId,
  users,
}: {
  projectId: string;
  users: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createTaskAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="title" required placeholder="Novo lembrete — ex.: Ligar pro fornecedor" className="input" />
      <select name="assigneeId" defaultValue="" className="input">
        <option value="">Sem responsável específico</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <textarea name="description" rows={2} placeholder="Detalhes (opcional)" className="input" />
      {state.errors?.length ? (
        <p className="text-xs text-danger">{state.errors.join(" ")}</p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-ghost text-xs">
        {pending ? "Adicionando…" : "Adicionar lembrete"}
      </button>
    </form>
  );
}

export function TasksSection({
  projectId,
  tasks,
  users,
}: {
  projectId: string;
  tasks: TaskData[];
  users: { id: string; name: string }[];
}) {
  const open = tasks.filter((t) => t.status === "OPEN");
  const done = tasks.filter((t) => t.status === "DONE");

  return (
    <section className="card p-6">
      <h2 className="mb-3 text-sm font-semibold">Lembretes ({open.length} em aberto)</h2>
      <p className="mb-4 text-xs text-muted">
        Pendências pontuais desta obra, fora do fluxo formal — não afetam a esteira nem exigem
        aprovação de ninguém.
      </p>

      {open.length === 0 && done.length === 0 ? (
        <p className="text-sm text-muted">Nenhum lembrete por aqui ainda.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((task) => (
            <TaskRow key={task.id} projectId={projectId} task={task} />
          ))}
          {done.map((task) => (
            <TaskRow key={task.id} projectId={projectId} task={task} />
          ))}
        </ul>
      )}

      <div className="mt-3">
        <NewTaskForm projectId={projectId} users={users} />
      </div>
    </section>
  );
}
