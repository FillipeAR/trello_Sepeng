"use client";

import { useActionState } from "react";
import { signUpAction, type SignupState } from "./actions";

const initial: SignupState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initial);

  if (state.success) {
    return (
      <div className="space-y-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        <p className="font-medium">Cadastro enviado.</p>
        <p>
          Mandamos um link de confirmação pro e-mail informado. Depois de confirmar, um
          administrador ainda precisa liberar seu acesso — você recebe aviso quando puder entrar.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Nome
        </label>
        <input id="name" name="name" required autoComplete="name" className="input" />
        {state.fieldErrors?.name ? <p className="mt-1 text-xs text-danger">{state.fieldErrors.name}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        {state.fieldErrors?.email ? <p className="mt-1 text-xs text-danger">{state.fieldErrors.email}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="password">
          Senha
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
          Confirmar senha
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
        {pending ? "Enviando…" : "Criar conta"}
      </button>
    </form>
  );
}
