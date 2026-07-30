"use client";

import { useActionState } from "react";
import { testSub2Action, type TestState } from "./actions";

export function TestSub2Form() {
  const [state, formAction, pending] = useActionState(testSub2Action, {});

  return (
    <form action={formAction} className="card space-y-5 p-6">
      {state.message ? <p>{state.message}</p> : null}

      <div>
        <label className="label" htmlFor="projectName">
          Nome da obra
        </label>
        <input id="projectName" name="projectName" required className="input" placeholder="Ex.: Galpão" />
      </div>

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Cadastrando…" : "Cadastrar obra"}
      </button>
    </form>
  );
}
