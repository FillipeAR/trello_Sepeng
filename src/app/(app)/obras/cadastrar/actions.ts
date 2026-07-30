"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError, createProject } from "@/modules/projects/commands";
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
  const actor = await requireActor();
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
    return toState(error);
  }

  await processOutbox();
  revalidatePath("/obras");
  revalidatePath("/dashboard");
  redirect(`/obras/${projectId}`);
}
