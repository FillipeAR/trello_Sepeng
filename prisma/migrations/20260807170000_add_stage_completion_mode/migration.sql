
-- CreateEnum
CREATE TYPE "StageCompletionMode" AS ENUM ('FORM', 'EXTERNAL');

-- AlterTable
ALTER TABLE "workflow_stages" ADD COLUMN     "completionMode" "StageCompletionMode" NOT NULL DEFAULT 'FORM',
ADD COLUMN     "externalCompletionLabel" TEXT,
ADD COLUMN     "externalCompletionPath" TEXT;

