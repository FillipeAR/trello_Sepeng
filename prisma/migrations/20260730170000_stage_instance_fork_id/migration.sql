-- AlterTable
ALTER TABLE "stage_instances" ADD COLUMN "forkId" TEXT;

-- CreateIndex
CREATE INDEX "stage_instances_workflowInstanceId_forkId_idx" ON "stage_instances"("workflowInstanceId", "forkId");
