"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import { createSupplier, deleteSupplier, updateSupplier } from "@/modules/procurement/commands";

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

function supplierDataFromForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    cnpj: String(formData.get("cnpj") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await createSupplier(actor, { data: supplierDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/fornecedores");
  return { success: true };
}

export async function updateSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateSupplier(actor, {
      supplierId: String(formData.get("supplierId") ?? ""),
      data: supplierDataFromForm(formData),
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/fornecedores");
  return { success: true };
}

export async function deleteSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await deleteSupplier(actor, { supplierId: String(formData.get("supplierId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/fornecedores");
  return { success: true };
}
