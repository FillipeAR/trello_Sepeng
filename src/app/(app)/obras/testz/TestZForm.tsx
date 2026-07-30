"use client";

import { useActionState } from "react";
import { testZAction, type TestState } from "./actions";

export function TestZForm() {
  const [state, formAction] = useActionState(testZAction, {});
  return (
    <form action={formAction}>
      <input name="a" className="input" />
      <input name="b" type="number" className="input" />
      <input name="c" type="date" className="input" />
      <button type="submit">Testar</button>
      <p>{state.message}</p>
    </form>
  );
}
