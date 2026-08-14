import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/server/actor";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { getMyNotificationSettings } from "@/modules/notifications/queries";
import { WhatsAppPreferences } from "@/modules/notifications/components/WhatsAppPreferences";
import { EmailPreferences } from "@/modules/notifications/components/EmailPreferences";

export default async function NotificacoesPage() {
  const actor = await requireActor();

  const [notifications, settings] = await Promise.all([
    prisma.notification.findMany({
      where: { organizationId: actor.organizationId, userId: actor.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getMyNotificationSettings(actor),
  ]);

  async function markAllRead() {
    "use server";
    const current = await requireActor();
    await prisma.notification.updateMany({
      where: { organizationId: current.organizationId, userId: current.userId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/notificacoes");
  }

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
          <p className="text-sm text-muted">{unread} não lida(s).</p>
        </div>
        {unread > 0 ? (
          <form action={markAllRead}>
            <button type="submit" className="btn-ghost text-xs">
              Marcar todas como lidas
            </button>
          </form>
        ) : null}
      </div>

      <WhatsAppPreferences settings={settings} />
      <EmailPreferences rows={settings.emailRows} />

      {notifications.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          Nenhuma notificação por enquanto.
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link
                href={n.linkUrl ?? "#"}
                className={`card block p-4 transition hover:border-primary/40 ${
                  n.readAt ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium">{n.title}</span>
                  <span className="text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{n.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
