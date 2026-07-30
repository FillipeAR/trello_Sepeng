"use client";

import { useActionState } from "react";
import { testAction2, type TestState } from "./actions";

export function TestForm2() {
  const [state, formAction] = useActionState(testAction2, {});
  return (
    <form action={formAction}>
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
