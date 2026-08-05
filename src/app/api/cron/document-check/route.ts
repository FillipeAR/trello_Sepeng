import { NextResponse, type NextRequest } from "next/server";
import { checkDocumentExpirations } from "@/modules/documents/expiry";
import { processOutbox } from "@/modules/notifications/dispatcher";

/**
 * Chamado pelo cron do Vercel (`vercel.ts`). Mesma proteção de
 * `/api/cron/sla-check`: sem `CRON_SECRET` configurada, qualquer um que
 * descobrisse a URL poderia disparar o job.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  const result = await checkDocumentExpirations();
  const processed = await processOutbox();

  return NextResponse.json({ ...result, processed });
}
