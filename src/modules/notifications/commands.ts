import { z } from "zod";
import { DOMAIN_EVENTS } from "@/server/outbox";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";

/**
 * Preferência de notificação e telefone são dados pessoais — o próprio
 * usuário gerencia os seus, sem permissão adicional (mesmo padrão de
 * `markAllRead` em /notificacoes). Não emitem `OutboxEvent`: não há quem
 * notificar sobre o usuário mudar a própria preferência.
 */

const EVENT_TYPES = Object.values(DOMAIN_EVENTS);
// EMAIL só é oferecido pros eventos em EMAIL_EVENTS (ver queries.ts e
// EmailPreferences.tsx) — os demais eventos ainda só têm WHATSAPP implementado.
const CHANNELS = ["WHATSAPP", "EMAIL"] as const;

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+\d{10,15}$/, "Use o formato internacional, ex.: +5511987654321.")
    .nullable(),
});

export async function updateMyPhone(actor: SessionContext, input: { phone: string | null }) {
  const data = phoneSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const after = await tx.user.update({ where: { id: actor.userId }, data: { phone: data.phone } });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "user.phone.updated",
      entityType: "User",
      entityId: actor.userId,
      summary: data.phone ? "Telefone para WhatsApp cadastrado." : "Telefone para WhatsApp removido.",
      before: { phone: before.phone },
      after: { phone: after.phone },
    });

    return after;
  });
}

const preferenceSchema = z.object({
  eventType: z.enum(EVENT_TYPES as [string, ...string[]]),
  channel: z.enum(CHANNELS),
  enabled: z.boolean(),
});

export async function setNotificationPreference(
  actor: SessionContext,
  input: { eventType: string; channel: (typeof CHANNELS)[number]; enabled: boolean },
) {
  const data = preferenceSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    if (data.channel === "WHATSAPP" && data.enabled) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
      if (!user.phone) {
        throw new CommandError("Cadastre um telefone antes de habilitar o WhatsApp.", {
          errors: ["Nenhum telefone cadastrado."],
        });
      }
    }

    const before = await tx.notificationPreference.findUnique({
      where: {
        userId_eventType_channel: {
          userId: actor.userId,
          eventType: data.eventType,
          channel: data.channel,
        },
      },
    });

    const after = await tx.notificationPreference.upsert({
      where: {
        userId_eventType_channel: {
          userId: actor.userId,
          eventType: data.eventType,
          channel: data.channel,
        },
      },
      create: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        eventType: data.eventType,
        channel: data.channel,
        enabled: data.enabled,
      },
      update: { enabled: data.enabled },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "notification_preference.updated",
      entityType: "NotificationPreference",
      entityId: after.id,
      summary: `Preferência de ${data.channel} para "${data.eventType}" ${data.enabled ? "habilitada" : "desabilitada"}.`,
      before,
      after,
    });

    return after;
  });
}
