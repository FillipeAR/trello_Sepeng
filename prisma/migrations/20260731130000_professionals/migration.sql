-- AlterEnum
ALTER TYPE "FieldType" ADD VALUE 'STAFF';

-- CreateTable
CREATE TABLE "professionals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professionals_organizationId_deletedAt_idx" ON "professionals"("organizationId", "deletedAt");

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
