import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { DOMAIN_EVENTS } from "@/server/outbox";
import { resolveChannelEnabled, type NotificationChannel } from "@/core/notifications/preferences";

// Só WHATSAPP tem envio de verdade implementado por enquanto (ver dispatcher.ts).
const CONFIGURABLE_CHANNELS: NotificationChannel[] = ["WHATSAPP"];

const EVENT_LABELS: Record<string, string> = {
  [DOMAIN_EVENTS.PROJECT_CREATED]: "Nova obra cadastrada",
  [DOMAIN_EVENTS.STAGE_ENTERED]: "Obra avançou de etapa",
  [DOMAIN_EVENTS.STAGE_COMPLETED]: "Etapa concluída",
  [DOMAIN_EVENTS.STAGE_RETURNED]: "Obra devolvida para etapa anterior",
  [DOMAIN_EVENTS.PROJECT_REJECTED]: "Obra reprovada",
  [DOMAIN_EVENTS.PROJECT_FINISHED]: "Obra finalizada",
  [DOMAIN_EVENTS.TASK_ASSIGNED]: "Lembrete atribuído a mim",
  [DOMAIN_EVENTS.MENTION_CREATED]: "Fui mencionado num comentário",
  [DOMAIN_EVENTS.SLA_BREACHED]: "SLA de etapa vencido",
  [DOMAIN_EVENTS.MEASUREMENT_APPROVED]: "Minha medição foi aprovada",
  [DOMAIN_EVENTS.MEASUREMENT_REJECTED]: "Minha medição foi reprovada",
  [DOMAIN_EVENTS.DOCUMENT_EXPIRING_SOON]: "Documento perto de vencer",
  [DOMAIN_EVENTS.DOCUMENT_EXPIRED]: "Documento vencido",
};

export interface MyNotificationSettings {
  phone: string | null;
  rows: {
    eventType: string;
    label: string;
    channels: Record<NotificationChannel, boolean>;
  }[];
  /**
   * Único evento com opt-in por e-mail hoje (Jornal Sepeng) — fica fora da
   * matriz genérica `rows` de propósito: colocar EMAIL em `CONFIGURABLE_CHANNELS`
   * criaria um toggle pra todo evento, mas só news.published tem dispatcher de
   * e-mail de verdade (ver dispatcher.ts).
   */
  newsEmailEnabled: boolean;
}

export async function getMyNotificationSettings(actor: SessionContext): Promise<MyNotificationSettings> {
  const [user, prefs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { phone: true } }),
    prisma.notificationPreference.findMany({ where: { userId: actor.userId } }),
  ]);

  const hasPhone = Boolean(user.phone);

  const rows = Object.values(DOMAIN_EVENTS).map((eventType) => ({
    eventType,
    label: EVENT_LABELS[eventType] ?? eventType,
    channels: Object.fromEntries(
      CONFIGURABLE_CHANNELS.map((channel) => [
        channel,
        resolveChannelEnabled(prefs, eventType, channel, { hasPhone }),
      ]),
    ) as Record<NotificationChannel, boolean>,
  }));

  const newsEmailEnabled = resolveChannelEnabled(prefs, DOMAIN_EVENTS.NEWS_PUBLISHED, "EMAIL", { hasPhone: true });

  return { phone: user.phone, rows, newsEmailEnabled };
}
