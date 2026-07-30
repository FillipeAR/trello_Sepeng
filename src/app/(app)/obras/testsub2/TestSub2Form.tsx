"use client";

import { useActionState } from "react";
import { testSub2Action, type TestState } from "./actions";

export function TestSub2Form() {
  const [state, formAction, pending] = useActionState(testSub2Action, {});

  return (
    <form action={formAction} className="card space-y-5 p-6">
      {state.message ? <p>{state.message}</p> : null}

      <div>
        <label className="label" htmlFor="name">
          Nome da obra
        </label>
        <input id="name" name="name" required className="input" placeholder="Ex.: Galpão" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="client">
            Cliente
          </label>
          <input id="client" name="client" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="contractValue">
            Valor do contrato (R$)
          </label>
          <input
            id="contractValue"
            name="contractValue"
            type="number"
            step="0.01"
            min="0"
            required
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="location">
          Localização
        </label>
        <input id="location" name="location" required className="input" placeholder="Cidade / UF" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="plannedStartDate">
            Início previsto
          </label>
          <input id="plannedStartDate" name="plannedStartDate" type="date" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="plannedEndDate">
            Término previsto
          </label>
          <input id="plannedEndDate" name="plannedEndDate" type="date" required className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="scopeSummary">
          Escopo resumido
        </label>
        <textarea id="scopeSummary" name="scopeSummary" rows={4} required className="input" />
      </div>

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Cadastrando…" : "Cadastrar obra"}
      </button>
    </form>
  );
}
