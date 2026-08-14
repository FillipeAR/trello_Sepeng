-- DropForeignKey
ALTER TABLE "external_notification_recipients" DROP CONSTRAINT "external_notification_recipients_organizationId_fkey";

-- DropTable
DROP TABLE "external_notification_recipients";
