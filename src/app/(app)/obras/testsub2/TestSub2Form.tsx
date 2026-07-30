"use client";

import { useActionState } from "react";
import { testSub2Action, type TestState } from "./actions";

export function TestSub2Form() {
  const [state, formAction] = useActionState(testSub2Action, {});
  return (
    <form action={formAction}>
      <input type="text" name="name" required defaultValue="valorfixo" className="input" />
      <input type="text" name="client" required defaultValue="valorfixo" className="input" />
      <input type="number" name="contractValue" step="0.01" min="0" required defaultValue="1000" className="input" />
      <input type="text" name="location" required defaultValue="valorfixo" className="input" />
      <input type="date" name="plannedStartDate" required defaultValue="2026-08-10" className="input" />
      <input type="date" name="plannedEndDate" required defaultValue="2026-09-10" className="input" />
      <textarea name="scopeSummary" rows={4} required className="input" defaultValue="Escopo padrão." />
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
