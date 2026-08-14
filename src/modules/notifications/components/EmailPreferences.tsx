"use client";

import { useActionState } from "react";
import { togglePreferenceAction, type ActionState } from "@/app/(app)/notificacoes/actions";

const initial: ActionState = {};

function EmailToggle({ eventType, label, enabled }: { eventType: string; label: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(togglePreferenceAction, initial);

  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm">{label}</span>
      <form action={action}>
        <input type="hidden" name="eventType" value={eventType} />
        <input type="hidden" name="channel" value="EMAIL" />
        <input type="hidden" name="enabled" value={(!enabled).toString()} />
        <button
          type="submit"
          disabled={pending}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            enabled ? "bg-success text-primary-foreground" : "bg-border text-muted"
          }`}
        >
          {enabled ? "Ligado" : "Desligado"}
        </button>
      </form>
      {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}
    </li>
  );
}

/**
 * Todo aviso por e-mail que não é departamental (ver dispatchOptInEmail em
 * dispatcher.ts) é opt-in por usuário aqui — inclusive o aviso de Obra
 * Ganha, que deixou de ser uma lista externa curada por admin e passou a
 * ser isto: qualquer usuário cadastrado escolhe se quer receber.
 */
export function EmailPreferences({ rows }: { rows: { eventType: string; label: string; enabled: boolean }[] }) {
  return (
    <section className="card p-6">
      <h2 className="mb-1 text-sm font-semibold">Notificação por e-mail</h2>
      <p className="mb-4 text-xs text-muted">Escolha quais avisos você quer receber por e-mail.</p>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <EmailToggle key={row.eventType} eventType={row.eventType} label={row.label} enabled={row.enabled} />
        ))}
      </ul>
    </section>
  );
}
