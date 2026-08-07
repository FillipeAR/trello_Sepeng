-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "area" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "company" TEXT;

-- CreateTable
CREATE TABLE "team_positions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sector" TEXT,
    "parentId" TEXT,
    "professionalId" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "positionX" DOUBLE PRECISION,
    "positionY" DOUBLE PRECISION,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "team_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_positions_organizationId_projectId_deletedAt_idx" ON "team_positions"("organizationId", "projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "team_positions_organizationId_parentId_idx" ON "team_positions"("organizationId", "parentId");

-- AddForeignKey
ALTER TABLE "team_positions" ADD CONSTRAINT "team_positions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_positions" ADD CONSTRAINT "team_positions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_positions" ADD CONSTRAINT "team_positions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "team_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_positions" ADD CONSTRAINT "team_positions_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

