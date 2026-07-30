"use client";

import { useActionState } from "react";
import { testSubAction, type TestState } from "./actions";

export function TestSubForm() {
  const [state, formAction] = useActionState(testSubAction, {});
  return (
    <form action={formAction}>
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
