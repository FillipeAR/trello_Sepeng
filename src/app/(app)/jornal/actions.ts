"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import { CommandError } from "@/modules/projects/commands";
import { createNewsPost, deleteNewsPost, updateNewsPost } from "@/modules/news/commands";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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

async function uploadImageIfPresent(
  organizationId: string,
  formData: FormData,
): Promise<{ url: string | null } | { error: ActionState }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { url: null };

  if (file.size > MAX_IMAGE_BYTES) {
    return { error: { errors: [`A imagem "${file.name}" passa de 8MB.`] } };
  }

  const blob = await put(`jornal/${organizationId}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });
  return { url: blob.url };
}

export async function createNewsPostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();

  const uploaded = await uploadImageIfPresent(actor.organizationId, formData);
  if ("error" in uploaded) return uploaded.error;

  try {
    await createNewsPost(actor, {
      data: {
        title: String(formData.get("title") ?? "").trim(),
        body: String(formData.get("body") ?? "").trim(),
        imageUrl: uploaded.url,
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/jornal");
  return { success: true };
}

export async function updateNewsPostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const newsPostId = String(formData.get("newsPostId") ?? "");

  const uploaded = await uploadImageIfPresent(actor.organizationId, formData);
  if ("error" in uploaded) return uploaded.error;

  try {
    await updateNewsPost(actor, {
      newsPostId,
      data: {
        title: String(formData.get("title") ?? "").trim(),
        body: String(formData.get("body") ?? "").trim(),
        imageUrl: uploaded.url ?? String(formData.get("existingImageUrl") ?? "") ?? null,
      },
    });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/jornal");
  return { success: true };
}

export async function deleteNewsPostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await deleteNewsPost(actor, { newsPostId: String(formData.get("newsPostId") ?? "") });
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/jornal");
  return { success: true };
}
