"use client";

import { useActionState } from "react";
import { testSub2Action, type TestState } from "./actions";

export function TestSub2Form() {
  const [state, formAction] = useActionState(testSub2Action, {});
  return (
    <form action={formAction}>
      <label htmlFor="name">Nome</label>
      <input type="text" id="name" name="name" required defaultValue="valorfixo" className="input" />
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
