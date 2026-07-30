"use client";

import { useActionState } from "react";
import { createProjectAction, type ActionState } from "./actions";

const initial: ActionState = {};

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, initial);

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <p className="text-sm font-medium text-danger" role="alert">
        {state.errors?.join(" ") || " "}
      </p>

      <input
        name="name"
        required
        aria-label="Nome da obra"
        placeholder="Nome da obra — ex.: Galpão Industrial BYD, Fase 2"
        className="input"
      />
      <p className="text-xs text-danger">{state.fieldErrors?.name || " "}</p>

      <input name="client" required aria-label="Cliente" placeholder="Cliente" className="input" />
      <p className="text-xs text-danger">{state.fieldErrors?.client || " "}</p>

      <input
        name="contractValue"
        type="number"
        step="0.01"
        min="0"
        required
        aria-label="Valor do contrato em reais"
        placeholder="Valor do contrato (R$)"
        className="input"
      />
      <p className="text-xs text-danger">{state.fieldErrors?.contractValue || " "}</p>

      <input
        name="location"
        required
        aria-label="Localização"
        placeholder="Localização — Cidade / UF"
        className="input"
      />
      <p className="text-xs text-danger">{state.fieldErrors?.location || " "}</p>

      <input name="plannedStartDate" type="date" required aria-label="Início previsto" className="input" />
      <p className="text-xs text-danger">{state.fieldErrors?.plannedStartDate || " "}</p>

      <input name="plannedEndDate" type="date" required aria-label="Término previsto" className="input" />
      <p className="text-xs text-danger">{state.fieldErrors?.plannedEndDate || " "}</p>

      <textarea
        name="scopeSummary"
        rows={4}
        required
        aria-label="Escopo resumido"
        placeholder="Escopo resumido"
        className="input"
      />
      <p className="text-xs text-danger">{state.fieldErrors?.scopeSummary || " "}</p>

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Cadastrando…" : "Cadastrar obra"}
      </button>
    </form>
  );
}
