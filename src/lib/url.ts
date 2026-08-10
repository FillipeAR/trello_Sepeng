/**
 * URL pública da aplicação, pra montar links absolutos em e-mail (ex.: confirmação
 * de cadastro). `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` são injetadas
 * automaticamente pela Vercel — não precisa configurar nada a mais em produção.
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
