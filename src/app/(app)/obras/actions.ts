"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActor, requireActor } from "@/server/actor";
import {
  CommandError,
  createProject,
  executeStageAction,
  registerProjectUpdate,
} from "@/modules/projects/commands";
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
 * `<input type="date">` devolve "AAAA-MM-DD", que o `Date` interpreta como
 * meia-noite UTC — em BRT isso volta um dia. Interpreta como data local.
 */
function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const debugActor = await getActor();
  if (!debugActor) {
    return { errors: [`DEBUG: getActor() retornou null. formData keys: ${[...formData.keys()].join(",")}`] };
  }
  const actor = debugActor;
  let projectId: string;

  try {
    const project = await createProject(actor, {
      name: String(formData.get("name") ?? ""),
      client: String(formData.get("client") ?? ""),
      contractValue: Number(formData.get("contractValue") ?? 0),
      location: String(formData.get("location") ?? ""),
      plannedStartDate: parseLocalDate(String(formData.get("plannedStartDate") ?? "")),
      plannedEndDate: parseLocalDate(String(formData.get("plannedEndDate") ?? "")),
      scopeSummary: String(formData.get("scopeSummary") ?? ""),
    });
    projectId = project.id;
  } catch (error) {
    return { errors: [`DEBUG: createProject threw: ${error instanceof Error ? error.message : String(error)}`] };
  }

  return { success: true, errors: [`DEBUG: sucesso, projectId=${projectId}`] };
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
    await executeStageAction(actor, { projectId, actionKey, fieldValues, comment });
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
