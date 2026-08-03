import { NextResponse, type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { getActor } from "@/server/actor";
import { canActorReadProject } from "@/modules/projects/queries";

/**
 * Anexos ficam num Blob store privado — não têm URL pública. Todo download
 * passa por aqui, que refaz a mesma checagem de leitura de obra usada no
 * resto do app antes de buscar o conteúdo real no Blob.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = request.nextUrl.searchParams.get("url");
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!url || !projectId) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  // O pathname sempre começa com obras/{projectId}/... — garante que a URL
  // pertence mesmo à obra informada, não só a alguma obra que o ator acessa.
  if (!url.includes(`/obras/${projectId}/`)) {
    return NextResponse.json({ error: "Anexo não pertence a esta obra." }, { status: 403 });
  }

  const allowed = await canActorReadProject(actor, projectId);
  if (!allowed) return NextResponse.json({ error: "Sem acesso a esta obra." }, { status: 403 });

  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  }

  const filename = result.blob.pathname.split("/").pop() ?? "anexo";
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
