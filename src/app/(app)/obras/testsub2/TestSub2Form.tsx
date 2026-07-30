"use client";

import { useActionState } from "react";
import { testSub2Action, type TestState } from "./actions";

export function TestSub2Form() {
  const [state, formAction, pending] = useActionState(testSub2Action, {});

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <span className="label">Nome da obra</span>
      <input name="name" required defaultValue="valor123" className="input" />

      <span className="label">Cliente</span>
      <input name="client" required defaultValue="valor123" className="input" />

      <span className="label">Valor do contrato (R$)</span>
      <input name="contractValue" type="number" step="0.01" min="0" required defaultValue="1000" className="input" />

      <span className="label">Localização</span>
      <input name="location" required defaultValue="valor123" className="input" />

      <span className="label">Início previsto</span>
      <input name="plannedStartDate" type="date" required defaultValue="2026-08-10" className="input" />

      <span className="label">Término previsto</span>
      <input name="plannedEndDate" type="date" required defaultValue="2026-09-10" className="input" />

      <span className="label">Escopo resumido</span>
      <textarea name="scopeSummary" rows={4} required defaultValue="valor123" className="input" />

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Cadastrando…" : "Cadastrar obra"}
      </button>
      <p>{state.message}</p>
    </form>
  );
}
