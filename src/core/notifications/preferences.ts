/**
 * Regra pura de resolução de canal de notificação — sem Prisma, sem I/O.
 * `NotificationPreference` é dado por usuário/evento/canal; a ausência de uma
 * linha explícita tem um default por canal, não por "tudo ligado":
 *  - IN_APP: sempre ligado (é o feed principal, não dá pra silenciar na v1).
 *  - EMAIL/WHATSAPP: opt-in — sem linha explícita = desligado. WHATSAPP também
 *    exige telefone cadastrado, independente da preferência.
 */

export type NotificationChannel = "IN_APP" | "EMAIL" | "WHATSAPP";

export interface ChannelPreference {
  eventType: string;
  channel: NotificationChannel;
  enabled: boolean;
}

export function resolveChannelEnabled(
  prefs: ChannelPreference[],
  eventType: string,
  channel: NotificationChannel,
  ctx: { hasPhone: boolean },
): boolean {
  if (channel === "WHATSAPP" && !ctx.hasPhone) return false;

  const pref = prefs.find((p) => p.eventType === eventType && p.channel === channel);
  if (pref) return pref.enabled;

  return channel === "IN_APP";
}
