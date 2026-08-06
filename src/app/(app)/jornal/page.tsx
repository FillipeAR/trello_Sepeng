import { requireActor } from "@/server/actor";
import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { listNewsPosts } from "@/modules/news/queries";
import { NewsFeed } from "./NewsFeed";

export default async function JornalPage() {
  const actor = await requireActor();
  const posts = await listNewsPosts(actor);
  const canManage = hasPermission(actor, PERMISSIONS.NEWS_MANAGE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Jornal Sepeng</h1>
        <p className="text-sm text-muted">Notícias e avisos da empresa.</p>
      </div>

      <NewsFeed posts={posts} canManage={canManage} />
    </div>
  );
}
