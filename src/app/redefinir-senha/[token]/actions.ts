"use server";

import { z } from "zod";
import { CommandError } from "@/modules/projects/commands";
import { resetPassword } from "@/modules/auth/commands";

export interface ResetPasswordState {
  errors?: string[];
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function toState(error: unknown): ResetPasswordState {
  if (error instanceof CommandError) {
    return {
      errors: error.details.errors.length > 0 ? error.details.errors : [error.message],
      fieldErrors: Object.fromEntries((error.details.fieldErrors ?? []).map((f) => [f.fieldKey, f.message])),
    };
  }
  if (error instanceof z.ZodError) {
    return {
      errors: ["Verifique os campos destacados."],
      fieldErrors: Object.fromEntries(error.issues.map((i) => [String(i.path[0] ?? "_"), i.message])),
    };
  }
  throw error;
}

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  try {
    await resetPassword({
      data: {
        token: String(formData.get("token") ?? ""),
        password: String(formData.get("password") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      },
    });
  } catch (error) {
    return toState(error);
  }

  return { success: true };
}
