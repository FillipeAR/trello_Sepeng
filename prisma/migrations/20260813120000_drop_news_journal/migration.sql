-- DropForeignKey
ALTER TABLE "news_posts" DROP CONSTRAINT "news_posts_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "news_posts" DROP CONSTRAINT "news_posts_authorId_fkey";

-- DropTable
DROP TABLE "news_posts";

-- AlterTable
ALTER TABLE "workflow_stages" DROP COLUMN "postsToJournal";
