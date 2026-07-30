"use client";

import { useActionState } from "react";
import { createProjectAction, type ActionState } from "./actions";

const initial: ActionState = {};

function allErrors(state: ActionState): string {
  const list = [...(state.errors ?? []), ...Object.values(state.fieldErrors ?? {})];
  return list.length ? list.join(" · ") : "";
}

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, initial);
  const errorText = allErrors(state);

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <input
        name="name"
        aria-label="Nome da obra"
        placeholder="Nome da obra — ex.: Galpão Industrial BYD, Fase 2"
        className="input"
      />
      <input name="client" aria-label="Cliente" placeholder="Cliente" className="input" />
      <input
        name="contractValue"
        type="number"
        step="0.01"
        min="0"
        aria-label="Valor do contrato em reais"
        placeholder="Valor do contrato (R$)"
        className="input"
      />
      <input
        name="location"
        aria-label="Localização"
        placeholder="Localização — Cidade / UF"
        className="input"
      />
      <input name="plannedStartDate" type="date" aria-label="Início previsto" className="input" />
      <input name="plannedEndDate" type="date" aria-label="Término previsto" className="input" />
      <textarea
        name="scopeSummary"
        rows={4}
        aria-label="Escopo resumido"
        placeholder="Escopo resumido"
        className="input"
      />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Cadastrando…" : "Cadastrar obra"}
      </button>
      {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}
    </form>
  );
}
