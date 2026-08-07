-- DropForeignKey
ALTER TABLE "org_chart_positions" DROP CONSTRAINT "org_chart_positions_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "org_chart_positions" DROP CONSTRAINT "org_chart_positions_parentId_fkey";

-- DropForeignKey
ALTER TABLE "project_org_chart_assignments" DROP CONSTRAINT "project_org_chart_assignments_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "project_org_chart_assignments" DROP CONSTRAINT "project_org_chart_assignments_positionId_fkey";

-- DropForeignKey
ALTER TABLE "project_org_chart_assignments" DROP CONSTRAINT "project_org_chart_assignments_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "project_org_chart_assignments" DROP CONSTRAINT "project_org_chart_assignments_projectId_fkey";

-- DropTable
DROP TABLE "org_chart_positions";

-- DropTable
DROP TABLE "project_org_chart_assignments";

