"use client";

import { useActionState } from "react";
import { testSub2Action, type TestState } from "./actions";

export function TestSub2Form() {
  const [state, formAction] = useActionState(testSub2Action, {});
  return (
    <form action={formAction}>
      <input type="text" name="name" defaultValue="valorfixo" className="input" />
      <input type="date" name="plannedStartDate" defaultValue="2026-08-10" className="input" />
      <input type="number" name="contractValue" step="0.01" min="0" defaultValue="1000" className="input" />
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
