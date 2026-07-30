"use client";

import { useActionState } from "react";
import { testSub2Action, type TestState } from "./actions";

export function TestSub2Form() {
  const [state, formAction] = useActionState(testSub2Action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="hiddenField" value="valorfixo" />
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
