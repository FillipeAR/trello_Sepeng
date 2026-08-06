-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "org_chart_positions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "org_chart_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_org_chart_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "professionalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_org_chart_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_posts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "news_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_chart_positions_organizationId_deletedAt_idx" ON "org_chart_positions"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "org_chart_positions_organizationId_parentId_idx" ON "org_chart_positions"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "project_org_chart_assignments_projectId_positionId_key" ON "project_org_chart_assignments"("projectId", "positionId");

-- CreateIndex
CREATE INDEX "news_posts_organizationId_deletedAt_publishedAt_idx" ON "news_posts"("organizationId", "deletedAt", "publishedAt");

-- AddForeignKey
ALTER TABLE "org_chart_positions" ADD CONSTRAINT "org_chart_positions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_chart_positions" ADD CONSTRAINT "org_chart_positions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "org_chart_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_org_chart_assignments" ADD CONSTRAINT "project_org_chart_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_org_chart_assignments" ADD CONSTRAINT "project_org_chart_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_org_chart_assignments" ADD CONSTRAINT "project_org_chart_assignments_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "org_chart_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_org_chart_assignments" ADD CONSTRAINT "project_org_chart_assignments_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

