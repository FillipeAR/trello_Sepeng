"use client";

import { useActionState } from "react";
import { testFinalAction, type TestState } from "./actions";

export function TestFinalForm() {
  const [state, formAction] = useActionState(testFinalAction, {});
  return (
    <form action={formAction}>
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
