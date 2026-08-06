"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError, executeStageAction } from "@/modules/projects/commands";
import { completeTask, createTask, deleteTask, reopenTask } from "@/modules/tasks/commands";
import { createComment } from "@/modules/comments/commands";
import {
  approveMeasurement,
  cancelMeasurement,
  createMeasurement,
  rejectMeasurement,
  updateMeasurement,
} from "@/modules/measurements/commands";
import {
  createProjectDocument,
  deleteProjectDocument,
  updateProjectDocument,
} from "@/modules/documents/commands";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  deletePurchaseOrder,
  markPurchaseOrderDelivered,
  updatePurchaseOrder,
} from "@/modules/procurement/commands";
import { processOutbox } from "@/modules/notifications/dispatcher";
import { assignPosition } from "@/modules/orgchart/commands";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

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
      fieldErrors: Object.fromEntries(
        error.issues.map((i) => [String(i.path[0] ?? "_"), i.message]),
      ),
    };
  }
  throw error;
}

/**
 * Executa uma ação da etapa. Os valores dos campos dinâmicos vêm no FormData
 * com o prefixo `field.` — a decodificação é dirigida pela configuração da
 * etapa, não por um mapeamento fixo.
 */
export async function executeStageActionForm(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();

  const projectId = String(formData.get("projectId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  const actionKey = String(formData.get("actionKey") ?? "");
  const comment = String(formData.get("comment") ?? "");

  const fieldValues: Record<string, unknown> = {};
  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith("field.")) continue;
    const key = name.slice("field.".length);
    const type = String(formData.get(`type.${key}`) ?? "TEXT");
    if (type === "FILE") continue; // tratado à parte abaixo — precisa de upload assíncrono

    const value = String(raw);
    switch (type) {
      case "NUMBER":
      case "CURRENCY":
        fieldValues[key] = value === "" ? null : Number(value);
        break;
      case "CHECKBOX":
        fieldValues[key] = value === "on" || value === "true";
        break;
      case "MULTISELECT":
      case "USER_MULTI":
        fieldValues[key] = formData.getAll(name).map(String).filter(Boolean);
        break;
      default:
        fieldValues[key] = value;
    }
  }

  // Checkbox desmarcado não chega no FormData: normaliza para `false`.
  for (const [name] of formData.entries()) {
    if (!name.startsWith("type.")) continue;
    const key = name.slice("type.".length);
    if (String(formData.get(name)) === "CHECKBOX" && !(key in fieldValues)) {
      fieldValues[key] = false;
    }
  }

  // Anexos: sobem pro Vercel Blob antes de executar a ação. O valor gravado
  // no campo é {url, name, size} — igual a qualquer outro valor de campo pro
  // resto do sistema (engine, auditoria, etc. não sabem que é um arquivo).
  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith("field.")) continue;
    const key = name.slice("field.".length);
    const type = String(formData.get(`type.${key}`) ?? "TEXT");
    if (type !== "FILE" || !(raw instanceof File) || raw.size === 0) continue;

    if (raw.size > MAX_ATTACHMENT_BYTES) {
      return {
        errors: [`O arquivo "${raw.name}" passa de 20MB.`],
        fieldErrors: { [key]: "Arquivo muito grande (máx. 20MB)." },
      };
    }

    const blob = await put(`obras/${projectId}/${stageId}/${key}-${raw.name}`, raw, {
      access: "private",
      addRandomSuffix: true,
    });
    fieldValues[key] = { url: blob.url, name: raw.name, size: raw.size };
  }

  try {
    await executeStageAction(actor, { projectId, stageId, actionKey, fieldValues, comment });
  } catch (error) {
    return toState(error);
  }

  await processOutbox();
  revalidatePath(`/obras/${projectId}`);
  revalidatePath("/obras");
  revalidatePath("/dashboard");
  revalidatePath("/minhas-tarefas");
  return { success: true };
}

// --- Lembretes ---------------------------------------------------------------

/**
 * `<input type="date">` devolve "AAAA-MM-DD", que o `Date` interpreta como
 * meia-noite UTC — em BRT isso volta um dia. Interpreta como data local.
 */
function parseLocalDate(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00`) : null;
}

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const dueAt = String(formData.get("dueAt") ?? "").trim();

  try {
    await createTask(actor, {
      projectId,
      data: {
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim() || null,
        assigneeId: assigneeId || null,
        dueAt: parseLocalDate(dueAt),
      },
    });
  } catch (error) {
    return toState(error);
  }

  await processOutbox();
  revalidatePath(`/obras/${projectId}`);
  revalidatePath("/lembretes");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function completeTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await completeTask(actor, { taskId: String(formData.get("taskId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/obras/${projectId}`);
  revalidatePath("/lembretes");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function reopenTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await reopenTask(actor, { taskId: String(formData.get("taskId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/obras/${projectId}`);
  revalidatePath("/lembretes");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await deleteTask(actor, { taskId: String(formData.get("taskId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/obras/${projectId}`);
  revalidatePath("/lembretes");
  revalidatePath("/dashboard");
  return { success: true };
}

// --- Comentários ---------------------------------------------------------------

export async function createCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await createComment(actor, {
      projectId,
      data: {
        body: String(formData.get("body") ?? ""),
        mentionUserIds: formData.getAll("mentionUserIds").map(String).filter(Boolean),
      },
    });
  } catch (error) {
    return toState(error);
  }

  await processOutbox();
  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

// --- Medições --------------------------------------------------------------

function measurementDataFromForm(formData: FormData) {
  return {
    referenceDate: parseLocalDate(String(formData.get("referenceDate") ?? "")),
    plannedValue: String(formData.get("plannedValue") ?? ""),
    measuredValue: String(formData.get("measuredValue") ?? ""),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createMeasurementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await createMeasurement(actor, { projectId, data: measurementDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function updateMeasurementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  const measurementId = String(formData.get("measurementId") ?? "");

  try {
    await updateMeasurement(actor, { measurementId, data: measurementDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function cancelMeasurementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await cancelMeasurement(actor, { measurementId: String(formData.get("measurementId") ?? "") });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function approveMeasurementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await approveMeasurement(actor, { measurementId: String(formData.get("measurementId") ?? "") });
  } catch (error) {
    return toState(error);
  }

  await processOutbox();
  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function rejectMeasurementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await rejectMeasurement(actor, {
      measurementId: String(formData.get("measurementId") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    return toState(error);
  }

  await processOutbox();
  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

// --- Documentos com validade -------------------------------------------------

async function documentDataFromForm(formData: FormData, projectId: string) {
  const data: Record<string, unknown> = {
    type: String(formData.get("type") ?? ""),
    referenceNumber: String(formData.get("referenceNumber") ?? "").trim() || null,
    issuedAt: parseLocalDate(String(formData.get("issuedAt") ?? "")),
    expiresAt: parseLocalDate(String(formData.get("expiresAt") ?? "")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new CommandError("Arquivo muito grande (máx. 20MB).", {
        errors: ["O arquivo passa de 20MB."],
      });
    }
    const blob = await put(`obras/${projectId}/documentos/${Date.now()}-${file.name}`, file, {
      access: "private",
      addRandomSuffix: true,
    });
    data.file = { url: blob.url, name: file.name, size: file.size, mimeType: file.type || "application/octet-stream" };
  }

  return data;
}

export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    const data = await documentDataFromForm(formData, projectId);
    await createProjectDocument(actor, { projectId, data });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function updateDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");

  try {
    const data = await documentDataFromForm(formData, projectId);
    await updateProjectDocument(actor, { documentId, data });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function deleteDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await deleteProjectDocument(actor, { documentId: String(formData.get("documentId") ?? "") });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

// --- Pedidos de compra -------------------------------------------------------

function purchaseOrderDataFromForm(formData: FormData) {
  return {
    supplierId: String(formData.get("supplierId") ?? ""),
    description: String(formData.get("description") ?? "").trim(),
    value: String(formData.get("value") ?? "").trim() || null,
    orderedAt: parseLocalDate(String(formData.get("orderedAt") ?? "")) ?? undefined,
    expectedDeliveryDate: parseLocalDate(String(formData.get("expectedDeliveryDate") ?? "")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createPurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await createPurchaseOrder(actor, { projectId, data: purchaseOrderDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function updatePurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");

  try {
    await updatePurchaseOrder(actor, { purchaseOrderId, data: purchaseOrderDataFromForm(formData) });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function markPurchaseOrderDeliveredAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await markPurchaseOrderDelivered(actor, { purchaseOrderId: String(formData.get("purchaseOrderId") ?? "") });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function cancelPurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await cancelPurchaseOrder(actor, { purchaseOrderId: String(formData.get("purchaseOrderId") ?? "") });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function deletePurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await deletePurchaseOrder(actor, { purchaseOrderId: String(formData.get("purchaseOrderId") ?? "") });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}

export async function assignOrgChartPositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await assignPosition(actor, {
      projectId,
      positionId: String(formData.get("positionId") ?? ""),
      professionalId: String(formData.get("professionalId") ?? "") || null,
    });
  } catch (error) {
    return toState(error);
  }

  await processOutbox();
  revalidatePath(`/obras/${projectId}`);
  return { success: true };
}
