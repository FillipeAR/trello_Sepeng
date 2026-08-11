"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import {
  createExternalRecipient,
  deleteExternalRecipient,
  updateExternalRecipient,
} from "@/modules/recipients/commands";

export interface ActionState {
  errors?: string[];
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function toState(error: unknown): ActionState {
  if (error instanceof CommandError) {
    return {
      errors: error.details.errors.length > 0 ? error.details.errors : [error.message],
      fieldErrors: Object.fromEntries(
        (error.details.fieldErrors ?? []).map((f) => [f.fieldKey, f.message]),
      ),
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

function recipientDataFromForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
  };
}

export async function createExternalRecipientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await createExternalRecipient(actor, { data: recipientDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/avisos-externos");
  return { success: true };
}

export async function updateExternalRecipientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateExternalRecipient(actor, {
      recipientId: String(formData.get("recipientId") ?? ""),
      data: recipientDataFromForm(formData),
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/avisos-externos");
  return { success: true };
}

export async function deleteExternalRecipientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await deleteExternalRecipient(actor, { recipientId: String(formData.get("recipientId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/avisos-externos");
  return { success: true };
}
