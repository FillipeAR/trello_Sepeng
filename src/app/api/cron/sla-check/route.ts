import { NextResponse, type NextRequest } from "next/server";
import { checkSlaBreaches } from "@/modules/notifications/sla";
import { processOutbox } from "@/modules/notifications/dispatcher";

/**
 * Chamado pelo cron do Vercel (`vercel.ts`). Verifica a assinatura via
 * `CRON_SECRET` quando configurada — sem ela, qualquer um que descobrisse a
 * URL poderia disparar o job (não é secreto por natureza, é só um endpoint).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  const breaches = await checkSlaBreaches();
  const processed = await processOutbox();

  return NextResponse.json({ breaches, processed });
}
