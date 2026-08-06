"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import { createPosition, deletePosition, movePosition, updatePosition } from "@/modules/orgchart/commands";

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

export async function createPositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await createPosition(actor, {
      data: {
        title: String(formData.get("title") ?? "").trim(),
        parentId: String(formData.get("parentId") ?? "") || null,
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/organograma");
  return { success: true };
}

export async function updatePositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updatePosition(actor, {
      positionId: String(formData.get("positionId") ?? ""),
      data: {
        title: String(formData.get("title") ?? "").trim(),
        parentId: String(formData.get("parentId") ?? "") || null,
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/organograma");
  return { success: true };
}

export async function deletePositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await deletePosition(actor, { positionId: String(formData.get("positionId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/organograma");
  return { success: true };
}

export async function movePositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await movePosition(actor, {
      positionId: String(formData.get("positionId") ?? ""),
      direction: formData.get("direction") === "up" ? "up" : "down",
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/organograma");
  return { success: true };
}
