import { formatDateTime } from "@/lib/format";
import type { ProjectActivityItem } from "@/modules/projects/activity";

/**
 * Feed de atualizações narradas pelo sistema — não é uma conversa entre
 * pessoas (isso é `CommentsSection`). Mostra pra qualquer setor que acompanha
 * a obra tudo que aconteceu nela, mesmo o que a notificação original não
 * mandou pra esse setor específico.
 */
export function ActivityFeed({ items }: { items: ProjectActivityItem[] }) {
  return (
    <section className="card p-6">
      <h2 className="mb-1 text-sm font-semibold">Atualizações</h2>
      <p className="mb-3 text-xs text-muted">
        Narrado automaticamente pelo ObraFlow — visível pra qualquer setor que acompanha esta obra.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma atualização registrada ainda.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span aria-hidden className="text-primary">
                    ●
                  </span>
                  ObraFlow
                </span>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-sm text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
