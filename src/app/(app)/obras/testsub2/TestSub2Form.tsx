"use client";

import { useActionState } from "react";
import { testSub2Action, type TestState } from "./actions";

export function TestSub2Form() {
  const [state, formAction, pending] = useActionState(testSub2Action, {});

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <span className="label">Nome da obra</span>
      <input name="name" required className="input" />

      <span className="label">Cliente</span>
      <input name="client" required className="input" />

      <span className="label">Valor do contrato (R$)</span>
      <input name="contractValue" type="number" step="0.01" min="0" required className="input" />

      <span className="label">Localização</span>
      <input name="location" required className="input" />

      <span className="label">Início previsto</span>
      <input name="plannedStartDate" type="date" required className="input" />

      <span className="label">Término previsto</span>
      <input name="plannedEndDate" type="date" required className="input" />

      <span className="label">Escopo resumido</span>
      <textarea name="scopeSummary" rows={4} required className="input" />

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Cadastrando…" : "Cadastrar obra"}
      </button>
      <p>{state.message}</p>
    </form>
  );
}
