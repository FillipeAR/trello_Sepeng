/**
 * Status de validade de documento (ART/RRT, alvará, licença, seguro, ...) —
 * sem Prisma, sem I/O. Deriva sempre de `expiresAt` x `now`, nunca gravado
 * como coluna: evita o clássico "status" que fica desatualizado. Mesmo
 * limiar (`DOCUMENT_EXPIRY_WARNING_DAYS`) usado pela UI (badge) e pelo cron
 * de aviso (`checkDocumentExpirations`), pra nunca desalinhar os dois.
 */

export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;

export type DocumentValidityStatus = "OK" | "EXPIRING_SOON" | "EXPIRED";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Arredonda pra cima: "vence daqui a 0 dias" já é hoje, não "já passou". */
export function daysUntilExpiry(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
}

export function documentValidityStatus(expiresAt: Date, now: Date): DocumentValidityStatus {
  const days = daysUntilExpiry(expiresAt, now);
  if (days < 0) return "EXPIRED";
  if (days <= DOCUMENT_EXPIRY_WARNING_DAYS) return "EXPIRING_SOON";
  return "OK";
}
