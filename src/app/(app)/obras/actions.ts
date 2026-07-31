"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError, executeStageAction, registerProjectUpdate } from "@/modules/projects/commands";
import { completeTask, createTask, deleteTask, reopenTask } from "@/modules/tasks/commands";
import { processOutbox } from "@/modules/notifications/dispatcher";

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

export async function registerUpdateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await registerProjectUpdate(actor, {
      projectId,
      type: String(formData.get("type") ?? "PROGRESS") as "PROGRESS" | "INCIDENT" | "NOTE",
      description: String(formData.get("description") ?? ""),
      progressPercent: formData.get("progressPercent")
        ? Number(formData.get("progressPercent"))
        : undefined,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/obras/${projectId}`);
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
