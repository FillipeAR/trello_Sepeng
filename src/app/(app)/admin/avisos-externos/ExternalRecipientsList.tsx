"use client";

import { useActionState, useRef } from "react";
import {
  createExternalRecipientAction,
  deleteExternalRecipientAction,
  updateExternalRecipientAction,
  type ActionState,
} from "./actions";

const initial: ActionState = {};

export interface ExternalRecipientData {
  id: string;
  name: string;
  email: string;
}

function RecipientRow({ recipient }: { recipient: ExternalRecipientData }) {
  const [state, formAction, pending] = useActionState(updateExternalRecipientAction, initial);
  const [deleteState, deleteAction] = useActionState(deleteExternalRecipientAction, initial);

  return (
    <div className="rounded-lg border border-border p-3">
      <form action={formAction} className="grid gap-2 sm:grid-cols-[1.8fr_1.8fr_auto]">
        <input type="hidden" name="recipientId" value={recipient.id} />
        <input name="name" required defaultValue={recipient.name} placeholder="Nome" className="input" />
        <input
          name="email"
          type="email"
          required
          defaultValue={recipient.email}
          placeholder="E-mail"
          className="input"
        />
        <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between gap-2">
        {state.errors?.length || deleteState.errors?.length ? (
          <p className="text-xs text-danger">
            {[...(state.errors ?? []), ...(deleteState.errors ?? [])].join(" ")}
          </p>
        ) : (
          <span />
        )}
        <form action={deleteAction}>
          <input type="hidden" name="recipientId" value={recipient.id} />
          <button
            type="submit"
            onClick={(e) => {
              if (!window.confirm(`Remover "${recipient.name}" da lista de avisos?`)) e.preventDefault();
            }}
            className="text-xs text-muted hover:text-danger"
          >
            Excluir
          </button>
        </form>
      </div>
    </div>
  );
}

function NewRecipientForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createExternalRecipientAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-[1.8fr_1.8fr_auto]"
    >
      <input name="name" required placeholder="Nome" className="input" />
      <input name="email" type="email" required placeholder="E-mail" className="input" />
      <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
        {pending ? "Adicionando…" : "Adicionar"}
      </button>
      {state.errors?.length ? (
        <p className="text-xs text-danger sm:col-span-3">{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}

export function ExternalRecipientsList({ recipients }: { recipients: ExternalRecipientData[] }) {
  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Contatos ({recipients.length})
      </h2>

      {recipients.length === 0 ? (
        <p className="text-sm text-muted">Nenhum contato cadastrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {recipients.map((r) => (
            <RecipientRow key={r.id} recipient={r} />
          ))}
        </div>
      )}

      <NewRecipientForm />
    </div>
  );
}
