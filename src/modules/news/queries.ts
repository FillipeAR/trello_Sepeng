import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";

/** Feed do Jornal Sepeng — aberto a todo mundo autenticado na organização. */
export async function listNewsPosts(actor: SessionContext) {
  const posts = await prisma.newsPost.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null },
    orderBy: { publishedAt: "desc" },
    take: 30,
    include: { author: { select: { name: true } } },
  });

  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    imageUrl: p.imageUrl,
    publishedAt: p.publishedAt,
    authorName: p.author.name,
  }));
}
