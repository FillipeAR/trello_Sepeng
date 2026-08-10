"use server";

import { z } from "zod";
import { CommandError } from "@/modules/projects/commands";
import { signUp } from "@/modules/auth/commands";
import { processOutbox } from "@/modules/notifications/dispatcher";

export interface SignupState {
  errors?: string[];
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function toState(error: unknown): SignupState {
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

export async function signUpAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  try {
    await signUp({
      data: {
        name: String(formData.get("name") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      },
    });
  } catch (error) {
    return toState(error);
  }

  await processOutbox();
  return { success: true };
}
