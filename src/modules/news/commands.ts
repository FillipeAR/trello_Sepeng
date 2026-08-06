import { z } from "zod";
import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";

/** Jornal Sepeng — notícias da empresa. Publicar exige `news:manage`; ler é aberto a todo mundo. */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.NEWS_MANAGE)) {
    throw new CommandError("Você não tem permissão para publicar no Jornal Sepeng.", {
      errors: ["Permissão news:manage ausente."],
    });
  }
}

const newsPostSchema = z.object({
  title: z.string().min(3, "Informe um título."),
  body: z.string().min(5, "Escreva o conteúdo da notícia."),
  imageUrl: z.string().optional().nullable(),
});

export async function createNewsPost(actor: SessionContext, input: { data: unknown }) {
  requireManage(actor);
  const data = newsPostSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const post = await tx.newsPost.create({
      data: {
        organizationId: actor.organizationId,
        authorId: actor.userId,
        title: data.title,
        body: data.body,
        imageUrl: data.imageUrl || null,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "news.created",
      entityType: "NewsPost",
      entityId: post.id,
      summary: `Notícia "${post.title}" publicada no Jornal Sepeng.`,
      after: post,
    });

    return post;
  });
}

export async function updateNewsPost(actor: SessionContext, input: { newsPostId: string; data: unknown }) {
  requireManage(actor);
  const data = newsPostSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const post = await tx.newsPost.findFirst({
      where: { id: input.newsPostId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!post) {
      throw new CommandError("Notícia não encontrada.", { errors: ["Notícia inexistente."] });
    }

    const updated = await tx.newsPost.update({
      where: { id: post.id },
      data: { title: data.title, body: data.body, imageUrl: data.imageUrl || null },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "news.updated",
      entityType: "NewsPost",
      entityId: post.id,
      summary: `Notícia "${updated.title}" atualizada.`,
      before: post,
      after: updated,
    });

    return updated;
  });
}

export async function deleteNewsPost(actor: SessionContext, input: { newsPostId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const post = await tx.newsPost.findFirst({
      where: { id: input.newsPostId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!post) {
      throw new CommandError("Notícia não encontrada.", { errors: ["Notícia inexistente."] });
    }

    await tx.newsPost.update({ where: { id: post.id }, data: { deletedAt: new Date() } });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "news.deleted",
      entityType: "NewsPost",
      entityId: post.id,
      summary: `Notícia "${post.title}" removida do Jornal Sepeng.`,
      before: post,
    });
  });
}
