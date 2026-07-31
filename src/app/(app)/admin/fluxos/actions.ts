"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import {
  createAction,
  createDraftVersion,
  createField,
  createStage,
  deleteAction,
  deleteField,
  deleteStage,
  discardDraft,
  createTransition,
  deleteTransition,
  moveAction,
  moveField,
  moveStage,
  moveTransition,
  parseFieldOptions,
  publishVersion,
  updateAction,
  updateField,
  updateStage,
  updateTransition,
  updateVersionNotes,
} from "@/modules/workflow/commands";

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

function bool(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

function str(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function nullableStr(formData: FormData, name: string): string | null {
  const value = str(formData, name);
  return value.length > 0 ? value : null;
}

function stageDataFromForm(formData: FormData) {
  return {
    name: str(formData, "name"),
    displayStatus: str(formData, "displayStatus"),
    description: nullableStr(formData, "description"),
    departmentId: nullableStr(formData, "departmentId"),
    slaHours: nullableStr(formData, "slaHours") ? Number(str(formData, "slaHours")) : null,
    mode: (str(formData, "mode") || "SEQUENTIAL") as "SEQUENTIAL" | "PARALLEL",
    joinPolicy: (str(formData, "joinPolicy") || "ALL") as "ALL" | "ANY",
    isInitial: bool(formData, "isInitial"),
    isFinal: bool(formData, "isFinal"),
    color: str(formData, "color") || "#64748b",
  };
}

function fieldDataFromForm(formData: FormData) {
  const type = str(formData, "type") as
    | "TEXT"
    | "TEXTAREA"
    | "NUMBER"
    | "CURRENCY"
    | "DATE"
    | "SELECT"
    | "MULTISELECT"
    | "USER"
    | "USER_MULTI"
    | "CHECKBOX"
    | "FILE"
    | "STAFF";
  const needsOptions = type === "SELECT" || type === "MULTISELECT";
  return {
    label: str(formData, "label"),
    type,
    required: bool(formData, "required"),
    helpText: nullableStr(formData, "helpText"),
    options: needsOptions ? parseFieldOptions(str(formData, "optionsRaw")) : null,
  };
}

function actionDataFromForm(formData: FormData) {
  return {
    label: str(formData, "label"),
    kind: (str(formData, "kind") || "ADVANCE") as "ADVANCE" | "RETURN" | "REJECT" | "FINISH",
    targetStageId: nullableStr(formData, "targetStageId"),
    requiredPermission: nullableStr(formData, "requiredPermission"),
    requiresComment: bool(formData, "requiresComment"),
    variant: (str(formData, "variant") || "primary") as "primary" | "secondary" | "danger",
  };
}

function transitionDataFromForm(formData: FormData) {
  return {
    toStageId: str(formData, "toStageId"),
    actionId: nullableStr(formData, "actionId"),
    conditionOp: (str(formData, "conditionOp") || "always") as
      | "always"
      | "eq"
      | "neq"
      | "gt"
      | "gte"
      | "lt"
      | "lte"
      | "in"
      | "nin"
      | "isEmpty"
      | "isNotEmpty",
    conditionPath: nullableStr(formData, "conditionPath"),
    conditionValue: nullableStr(formData, "conditionValue"),
  };
}

// --- Rascunho ------------------------------------------------------------------

export async function createDraftVersionAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const definitionId = str(formData, "definitionId");
  const draft = await createDraftVersion(actor, { definitionId });
  revalidatePath("/admin/fluxos");
  redirect(`/admin/fluxos/${draft.id}/editar`);
}

export async function updateVersionNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await updateVersionNotes(actor, { versionId, notes: str(formData, "notes") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function discardDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await discardDraft(actor, { versionId });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/fluxos");
  redirect("/admin/fluxos");
}

export async function publishVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await publishVersion(actor, { versionId });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/admin/fluxos");
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  redirect("/admin/fluxos");
}

// --- Etapas ----------------------------------------------------------------

export async function createStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await createStage(actor, { versionId, data: stageDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function updateStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  const stageId = str(formData, "stageId");
  try {
    await updateStage(actor, { stageId, data: stageDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function deleteStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await deleteStage(actor, { stageId: str(formData, "stageId") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function moveStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await moveStage(actor, {
      stageId: str(formData, "stageId"),
      direction: str(formData, "direction") as "up" | "down",
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

// --- Campos ------------------------------------------------------------------

export async function createFieldAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  const stageId = str(formData, "stageId");
  try {
    await createField(actor, { stageId, data: fieldDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function updateFieldAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  const fieldId = str(formData, "fieldId");
  try {
    await updateField(actor, { fieldId, data: fieldDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function deleteFieldAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await deleteField(actor, { fieldId: str(formData, "fieldId") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function moveFieldAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await moveField(actor, {
      fieldId: str(formData, "fieldId"),
      direction: str(formData, "direction") as "up" | "down",
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

// --- Ações -------------------------------------------------------------------

export async function createActionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  const stageId = str(formData, "stageId");
  try {
    await createAction(actor, { stageId, data: actionDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function updateActionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  const actionId = str(formData, "actionId");
  try {
    await updateAction(actor, { actionId, data: actionDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function deleteActionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await deleteAction(actor, { actionId: str(formData, "actionId") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function moveActionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await moveAction(actor, {
      actionId: str(formData, "actionId"),
      direction: str(formData, "direction") as "up" | "down",
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

// --- Transições ----------------------------------------------------------------

export async function createTransitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  const stageId = str(formData, "stageId");
  try {
    await createTransition(actor, { stageId, data: transitionDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function updateTransitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  const transitionId = str(formData, "transitionId");
  try {
    await updateTransition(actor, { transitionId, data: transitionDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function deleteTransitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await deleteTransition(actor, { transitionId: str(formData, "transitionId") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}

export async function moveTransitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const versionId = str(formData, "versionId");
  try {
    await moveTransition(actor, {
      transitionId: str(formData, "transitionId"),
      direction: str(formData, "direction") as "up" | "down",
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/admin/fluxos/${versionId}/editar`);
  return { success: true };
}
