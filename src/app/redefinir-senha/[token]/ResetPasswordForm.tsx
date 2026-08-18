"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initial: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);

  if (state.success) {
    return (
      <div className="space-y-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        <p className="font-medium">Senha redefinida.</p>
        <p>Já pode entrar com a senha nova.</p>
        <Link href="/login" className="btn-primary mt-2 inline-block">
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label className="label" htmlFor="password">
          Senha nova
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="input"
        />
        {state.fieldErrors?.password ? (
          <p className="mt-1 text-xs text-danger">{state.fieldErrors.password}</p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="confirmPassword">
          Confirmar senha nova
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="input"
        />
        {state.fieldErrors?.confirmPassword ? (
          <p className="mt-1 text-xs text-danger">{state.fieldErrors.confirmPassword}</p>
        ) : null}
      </div>

      {state.errors?.length ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.errors.join(" ")}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Salvando…" : "Redefinir senha"}
      </button>
    </form>
  );
}
