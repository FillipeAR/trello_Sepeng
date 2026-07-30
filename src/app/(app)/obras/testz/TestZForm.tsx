"use client";

import { useActionState } from "react";
import { testZAction, type TestState } from "./actions";

export function TestZForm() {
  const [state, formAction, pending] = useActionState(testZAction, {});
  return (
    <form action={formAction}>
      <input name="name" className="input" />
      <input name="client" className="input" />
      <input name="contractValue" type="number" className="input" />
      <input name="location" className="input" />
      <input name="plannedStartDate" type="date" className="input" />
      <input name="plannedEndDate" type="date" className="input" />
      <textarea name="scopeSummary" className="input" />
      <button type="submit" disabled={pending}>
        Testar
      </button>
      <p>{state.message}</p>
    </form>
  );
}
