"use client";

import { useActionState } from "react";
import { testAction, type TestState } from "./actions";

export function TestForm() {
  const [state, formAction] = useActionState(testAction, {});
  return (
    <form action={formAction}>
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
