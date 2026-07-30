"use client";

import { useActionState } from "react";
import { createProjectAction, type ActionState } from "./actions";

const initial: ActionState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-danger">{message}</p>;
}

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, initial);

  return (
    <form action={formAction} className="card space-y-5 p-6">
      {state.errors?.length ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="name">
          Nome da obra
        </label>
        <input id="name" name="name" required className="input" placeholder="Ex.: Galpão Industrial BYD — Fase 2" />
        <FieldError message={state.fieldErrors?.name} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="client">
            Cliente
          </label>
          <input id="client" name="client" required className="input" />
          <FieldError message={state.fieldErrors?.client} />
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
          <FieldError message={state.fieldErrors?.contractValue} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="location">
          Localização
        </label>
        <input id="location" name="location" required className="input" placeholder="Cidade / UF" />
        <FieldError message={state.fieldErrors?.location} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="plannedStartDate">
            Início previsto
          </label>
          <input id="plannedStartDate" name="plannedStartDate" type="date" required className="input" />
          <FieldError message={state.fieldErrors?.plannedStartDate} />
        </div>
        <div>
          <label className="label" htmlFor="plannedEndDate">
            Término previsto
          </label>
          <input id="plannedEndDate" name="plannedEndDate" type="date" required className="input" />
          <FieldError message={state.fieldErrors?.plannedEndDate} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="scopeSummary">
          Escopo resumido
        </label>
        <textarea id="scopeSummary" name="scopeSummary" rows={4} required className="input" />
        <FieldError message={state.fieldErrors?.scopeSummary} />
      </div>

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Cadastrando…" : "Cadastrar obra"}
      </button>
    </form>
  );
}
