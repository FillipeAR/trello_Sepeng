"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type ForgotPasswordState } from "./actions";

const initial: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initial);

  if (state.success) {
    return (
      <div className="space-y-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        <p className="font-medium">Pedido enviado.</p>
        <p>
          Se houver uma conta com este e-mail, você recebe um link pra escolher uma senha nova
          — válido por 1 hora.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        {state.fieldErrors?.email ? <p className="mt-1 text-xs text-danger">{state.fieldErrors.email}</p> : null}
      </div>

      {state.errors?.length ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.errors.join(" ")}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Enviando…" : "Enviar link de redefinição"}
      </button>
    </form>
  );
}
