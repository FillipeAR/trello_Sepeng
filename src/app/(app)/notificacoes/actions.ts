"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import { setNotificationPreference, updateMyPhone } from "@/modules/notifications/commands";

export interface ActionState {
  errors?: string[];
  success?: boolean;
}

function toState(error: unknown): ActionState {
  if (error instanceof CommandError) {
    return { errors: error.details.errors.length > 0 ? error.details.errors : [error.message] };
  }
  if (error instanceof z.ZodError) {
    return { errors: error.issues.map((i) => i.message) };
  }
  throw error;
}

export async function updatePhoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const phone = String(formData.get("phone") ?? "").trim();

  try {
    await updateMyPhone(actor, { phone: phone || null });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/notificacoes");
  return { success: true };
}

export async function togglePreferenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const eventType = String(formData.get("eventType") ?? "");
  const channel = String(formData.get("channel") ?? "") as "WHATSAPP" | "EMAIL";
  const enabled = formData.get("enabled") === "true";

  try {
    await setNotificationPreference(actor, { eventType, channel, enabled });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/notificacoes");
  return { success: true };
}
