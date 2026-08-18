"use server";

import { z } from "zod";
import { CommandError } from "@/modules/projects/commands";
import { requestPasswordReset } from "@/modules/auth/commands";
import { processOutbox } from "@/modules/notifications/dispatcher";

export interface ForgotPasswordState {
  errors?: string[];
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function toState(error: unknown): ForgotPasswordState {
  if (error instanceof CommandError) {
    return {
      errors: error.details.errors.length > 0 ? error.details.errors : [error.message],
      fieldErrors: Object.fromEntries((error.details.fieldErrors ?? []).map((f) => [f.fieldKey, f.message])),
    };
  }
  if (error instanceof z.ZodError) {
    return {
      errors: ["Verifique o e-mail informado."],
      fieldErrors: Object.fromEntries(error.issues.map((i) => [String(i.path[0] ?? "_"), i.message])),
    };
  }
  throw error;
}

export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  try {
    await requestPasswordReset({ data: { email: String(formData.get("email") ?? "").trim() } });
  } catch (error) {
    return toState(error);
  }

  // Sempre "sucesso" do lado da UI, exista ou não a conta — evita revelar
  // se o e-mail está cadastrado.
  await processOutbox();
  return { success: true };
}
