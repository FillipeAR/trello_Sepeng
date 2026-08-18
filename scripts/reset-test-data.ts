/**
 * Script de uso local: apaga todas as obras (e dado dependente — StageInstance,
 * StageFieldValue, Comment, Attachment, OutboxEvent, AuditLog, Notification, etc.)
 * pra permitir testar o fluxo atual do zero. NÃO mexe em Organization, User,
 * Membership, Role/Permission, WorkflowVersion/Stage/Field/Action/Transition ou
 * Professional (cadastro de profissionais) — só dado "de obra".
 */
import "dotenv/config";
import { prisma } from "../src/server/db";

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  console.log(`Apagando ${projects.length} obra(s):`);
  for (const p of projects) console.log(` - ${p.name} (${p.id})`);

  const [notif, audit, outbox, mentions, comments, attachments] = await prisma.$transaction([
    prisma.notification.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.outboxEvent.deleteMany({}),
    prisma.mention.deleteMany({}),
    prisma.comment.deleteMany({}),
    prisma.attachment.deleteMany({}),
  ]);

  // Project cascade cobre: ProjectWorkflowInstance, StageInstance, StageFieldValue,
  // ProjectTeamAssignment, ProjectUpdate, TeamPosition, Task.
  const { count: projectCount } = await prisma.project.deleteMany({});

  console.log("\nApagado:");
  console.log({ notif: notif.count, audit: audit.count, outbox: outbox.count, mentions: mentions.count, comments: comments.count, attachments: attachments.count, projects: projectCount });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
