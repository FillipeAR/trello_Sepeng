"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import { createUser, setUserActive, updateUser } from "@/modules/users/commands";

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

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await createUser(actor, {
      data: {
        name: String(formData.get("name") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        roleId: String(formData.get("roleId") ?? ""),
        departmentId: String(formData.get("departmentId") ?? "") || null,
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/usuarios");
  return { success: true };
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateUser(actor, {
      userId: String(formData.get("userId") ?? ""),
      data: {
        name: String(formData.get("name") ?? "").trim(),
        roleId: String(formData.get("roleId") ?? ""),
        departmentId: String(formData.get("departmentId") ?? "") || null,
        password: String(formData.get("password") ?? ""),
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/usuarios");
  return { success: true };
}

export async function setUserActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await setUserActive(actor, {
      userId: String(formData.get("userId") ?? ""),
      isActive: formData.get("isActive") === "true",
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/usuarios");
  return { success: true };
}
