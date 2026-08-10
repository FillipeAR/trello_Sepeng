"use server";

import { AuthError } from "next-auth";
import { EmailNotVerifiedSignin, RateLimitedSignin, signIn } from "@/server/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof RateLimitedSignin) {
      return { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar de novo." };
    }
    if (error instanceof EmailNotVerifiedSignin) {
      return { error: "Confirme seu e-mail (veja o link que enviamos) antes de entrar." };
    }
    if (error instanceof AuthError) {
      return { error: "E-mail ou senha incorretos." };
    }
    // `signIn` sinaliza o redirect por exceção — deixa passar.
    throw error;
  }
}
