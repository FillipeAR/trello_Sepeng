-- AlterTable
ALTER TABLE "workflow_stages" ADD COLUMN     "postsToJournal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "outbox_events_organizationId_projectId_createdAt_idx" ON "outbox_events"("organizationId", "projectId", "createdAt");

-- AlterTable
ALTER TABLE "news_posts" ADD COLUMN     "sourceEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "news_posts_sourceEventId_key" ON "news_posts"("sourceEventId");

-- CreateTable
CREATE TABLE "external_notification_recipients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "external_notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_notification_recipients_organizationId_deletedAt_idx" ON "external_notification_recipients"("organizationId", "deletedAt");

-- AddForeignKey
ALTER TABLE "external_notification_recipients" ADD CONSTRAINT "external_notification_recipients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
