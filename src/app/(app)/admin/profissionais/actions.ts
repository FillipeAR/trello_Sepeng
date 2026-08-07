"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import { createProfessional, deleteProfessional, updateProfessional } from "@/modules/staff/commands";

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

function professionalDataFromForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    role: String(formData.get("role") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    // Esta tela não edita empresa/área/foto (isso é da tela "Equipe da obra") — carrega
    // os valores atuais via campo oculto pra não apagar o que já foi preenchido lá.
    company: String(formData.get("existingCompany") ?? "").trim() || null,
    area: String(formData.get("existingArea") ?? "").trim() || null,
    avatarUrl: String(formData.get("existingAvatarUrl") ?? "").trim() || null,
  };
}

export async function createProfessionalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await createProfessional(actor, { data: professionalDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/profissionais");
  return { success: true };
}

export async function updateProfessionalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateProfessional(actor, {
      professionalId: String(formData.get("professionalId") ?? ""),
      data: professionalDataFromForm(formData),
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/profissionais");
  return { success: true };
}

export async function deleteProfessionalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await deleteProfessional(actor, { professionalId: String(formData.get("professionalId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/profissionais");
  return { success: true };
}
