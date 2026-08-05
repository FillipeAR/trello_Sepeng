"use client";

import { useActionState } from "react";
import {
  togglePreferenceAction,
  updatePhoneAction,
  type ActionState,
} from "@/app/(app)/notificacoes/actions";
import type { MyNotificationSettings } from "@/modules/notifications/queries";

const initial: ActionState = {};

function EventToggle({ eventType, label, enabled }: { eventType: string; label: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(togglePreferenceAction, initial);

  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm">{label}</span>
      <form action={action}>
        <input type="hidden" name="eventType" value={eventType} />
        <input type="hidden" name="channel" value="WHATSAPP" />
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

export function WhatsAppPreferences({ settings }: { settings: MyNotificationSettings }) {
  const [phoneState, phoneAction, phonePending] = useActionState(updatePhoneAction, initial);
  const hasPhone = Boolean(settings.phone);

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-sm font-semibold">Notificação por WhatsApp</h2>
      <p className="mb-4 text-xs text-muted">
        Cadastre seu telefone e escolha quais eventos você quer receber por WhatsApp, além do
        aviso aqui dentro do sistema.
      </p>

      <form action={phoneAction} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label htmlFor="phone" className="label">
            Telefone (com DDI e DDD)
          </label>
          <input
            id="phone"
            name="phone"
            defaultValue={settings.phone ?? ""}
            placeholder="+5511987654321"
            className="input"
          />
        </div>
        <button type="submit" disabled={phonePending} className="btn-ghost text-xs">
          {phonePending ? "Salvando…" : "Salvar telefone"}
        </button>
      </form>
      {phoneState.errors?.length ? (
        <p className="mb-4 text-xs text-danger">{phoneState.errors.join(" ")}</p>
      ) : null}

      {!hasPhone ? (
        <p className="mb-2 text-xs text-warning">
          Cadastre um telefone acima para poder habilitar os eventos abaixo.
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {settings.rows.map((row) => (
          <EventToggle
            key={row.eventType}
            eventType={row.eventType}
            label={row.label}
            enabled={hasPhone && row.channels.WHATSAPP}
          />
        ))}
      </ul>
    </section>
  );
}
