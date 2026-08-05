import { NextResponse, type NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { getActor } from "@/server/actor";
import { CommandError, registerProjectUpdate } from "@/modules/projects/commands";
import { processOutbox } from "@/modules/notifications/dispatcher";

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

/**
 * Endpoint REST (não Server Action) de propósito: é chamado tanto pelo
 * formulário normal quanto pela fila offline (`src/lib/offline-queue.ts`),
 * que precisa reenviar via `fetch` puro depois que a conexão volta — Server
 * Action exige a árvore de renderização React viva, a fila não tem isso.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const formData = await request.formData();
  const projectId = String(formData.get("projectId") ?? "");
  const type = String(formData.get("type") ?? "PROGRESS");
  const description = String(formData.get("description") ?? "");
  const progressPercentRaw = formData.get("progressPercent");
  const progressPercent = progressPercentRaw ? Number(progressPercentRaw) : undefined;

  let photo: { url: string; name: string; size: number; mimeType: string } | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Foto muito grande (máx. 20MB)." }, { status: 400 });
    }
    const blob = await put(`obras/${projectId}/atualizacoes/${Date.now()}-${file.name}`, file, {
      access: "private",
      addRandomSuffix: true,
    });
    photo = { url: blob.url, name: file.name, size: file.size, mimeType: file.type || "application/octet-stream" };
  }

  try {
    const update = await registerProjectUpdate(actor, {
      projectId,
      type: type as "PROGRESS" | "INCIDENT" | "NOTE",
      description,
      progressPercent,
      photo,
    });
    await processOutbox();
    return NextResponse.json({ success: true, id: update.id });
  } catch (error) {
    if (error instanceof CommandError) {
      return NextResponse.json(
        { error: error.details.errors[0] ?? error.message },
        { status: 422 },
      );
    }
    throw error;
  }
}
