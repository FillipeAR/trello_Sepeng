"use client";

import { useActionState } from "react";
import { togglePreferenceAction, type ActionState } from "@/app/(app)/notificacoes/actions";
import { DOMAIN_EVENTS } from "@/server/outbox";

const initial: ActionState = {};

/**
 * Único evento com e-mail opt-in hoje — seção própria, não faz parte da
 * matriz genérica de WhatsAppPreferences (ver `newsEmailEnabled` em
 * notifications/queries.ts).
 */
export function NewsEmailPreference({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(togglePreferenceAction, initial);

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Jornal Sepeng por e-mail</h2>
          <p className="mt-1 text-xs text-muted">
            Receba um e-mail toda vez que sair um post novo no Jornal Sepeng, manual ou automático.
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="eventType" value={DOMAIN_EVENTS.NEWS_PUBLISHED} />
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
      </div>
      {state.errors?.length ? <p className="mt-2 text-xs text-danger">{state.errors.join(" ")}</p> : null}
    </section>
  );
}
