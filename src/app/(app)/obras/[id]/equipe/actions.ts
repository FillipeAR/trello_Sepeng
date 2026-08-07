"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import { createProfessional, updateProfessional } from "@/modules/staff/commands";
import { processOutbox } from "@/modules/notifications/dispatcher";
import {
  assignProfessional,
  createPosition,
  deletePosition,
  moveNodeOnCanvas,
  reparentPosition,
  updatePosition,
} from "@/modules/team/commands";
import { TEAM_POSITION_PERMISSIONS } from "@/modules/team/permissions-catalog";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export interface ActionState {
  errors?: string[];
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function toState(error: unknown): ActionState {
  if (error instanceof CommandError) {
    return {
      errors: error.details.errors.length > 0 ? error.details.errors : [error.message],
      fieldErrors: Object.fromEntries((error.details.fieldErrors ?? []).map((f) => [f.fieldKey, f.message])),
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

function permissionsFromForm(formData: FormData): string[] {
  const valid = new Set(TEAM_POSITION_PERMISSIONS.map((p) => p.key));
  return formData.getAll("permissions").map(String).filter((key) => valid.has(key as never));
}

export async function createPositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await createPosition(actor, {
      projectId,
      data: {
        title: String(formData.get("title") ?? "").trim(),
        sector: String(formData.get("sector") ?? "").trim() || null,
        parentId: String(formData.get("parentId") ?? "") || null,
        permissions: permissionsFromForm(formData),
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/obras/${projectId}/equipe`);
  return { success: true };
}

export async function updatePositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await updatePosition(actor, {
      positionId: String(formData.get("positionId") ?? ""),
      data: {
        title: String(formData.get("title") ?? "").trim(),
        sector: String(formData.get("sector") ?? "").trim() || null,
        parentId: String(formData.get("parentId") ?? "") || null,
        permissions: permissionsFromForm(formData),
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/obras/${projectId}/equipe`);
  return { success: true };
}

export async function deletePositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await deletePosition(actor, { positionId: String(formData.get("positionId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/obras/${projectId}/equipe`);
  return { success: true };
}

export async function assignProfessionalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await assignProfessional(actor, {
      positionId: String(formData.get("positionId") ?? ""),
      professionalId: String(formData.get("professionalId") ?? "") || null,
    });
  } catch (error) {
    return toState(error);
  }
  await processOutbox();
  revalidatePath(`/obras/${projectId}/equipe`);
  return { success: true };
}

/** Versão sem `<form>` — chamada direto do `onDrop` de arrastar uma pessoa pro cargo no canvas. */
export async function assignProfessionalDirect(input: {
  positionId: string;
  professionalId: string;
  projectId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireActor();
  try {
    await assignProfessional(actor, { positionId: input.positionId, professionalId: input.professionalId });
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.message };
    throw error;
  }
  await processOutbox();
  revalidatePath(`/obras/${input.projectId}/equipe`);
  return { ok: true };
}

/** Sem `revalidatePath`/redirect — chamada a cada soltar do nó no canvas, tem que ser silenciosa. */
export async function moveNodeOnCanvasAction(input: {
  positionId: string;
  positionX: number;
  positionY: number;
}): Promise<{ ok: boolean }> {
  const actor = await requireActor();
  try {
    await moveNodeOnCanvas(actor, input);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Idem — arrastar uma conexão pra outro cargo, reação precisa ser instantânea no canvas. */
export async function reparentPositionAction(input: {
  positionId: string;
  parentId: string | null;
  projectId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireActor();
  try {
    await reparentPosition(actor, { positionId: input.positionId, parentId: input.parentId });
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath(`/obras/${input.projectId}/equipe`);
  return { ok: true };
}

async function uploadAvatarIfPresent(
  organizationId: string,
  formData: FormData,
): Promise<{ url: string | null } | { error: ActionState }> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { url: null };

  if (file.size > MAX_AVATAR_BYTES) {
    return { error: { errors: [`A foto "${file.name}" passa de 5MB.`] } };
  }

  const blob = await put(`equipe/${organizationId}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });
  return { url: blob.url };
}

export async function createTeamProfessionalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  const uploaded = await uploadAvatarIfPresent(actor.organizationId, formData);
  if ("error" in uploaded) return uploaded.error;

  try {
    await createProfessional(actor, {
      data: {
        name: String(formData.get("name") ?? "").trim(),
        role: String(formData.get("role") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim() || null,
        email: String(formData.get("email") ?? "").trim() || null,
        company: String(formData.get("company") ?? "").trim() || null,
        area: String(formData.get("area") ?? "").trim() || null,
        avatarUrl: uploaded.url,
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/obras/${projectId}/equipe`);
  return { success: true };
}

export async function updateTeamProfessionalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = String(formData.get("projectId") ?? "");

  const uploaded = await uploadAvatarIfPresent(actor.organizationId, formData);
  if ("error" in uploaded) return uploaded.error;

  try {
    await updateProfessional(actor, {
      professionalId: String(formData.get("professionalId") ?? ""),
      data: {
        name: String(formData.get("name") ?? "").trim(),
        role: String(formData.get("role") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim() || null,
        email: String(formData.get("email") ?? "").trim() || null,
        company: String(formData.get("company") ?? "").trim() || null,
        area: String(formData.get("area") ?? "").trim() || null,
        avatarUrl: uploaded.url ?? (String(formData.get("existingAvatarUrl") ?? "").trim() || null),
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath(`/obras/${projectId}/equipe`);
  return { success: true };
}
