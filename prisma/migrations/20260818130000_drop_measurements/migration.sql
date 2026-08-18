-- DropForeignKey
ALTER TABLE "measurements" DROP CONSTRAINT "measurements_projectId_fkey";

-- DropForeignKey
ALTER TABLE "measurements" DROP CONSTRAINT "measurements_createdById_fkey";

-- DropForeignKey
ALTER TABLE "measurements" DROP CONSTRAINT "measurements_approvedById_fkey";

-- DropTable
DROP TABLE "measurements";

-- DropEnum
DROP TYPE "MeasurementStatus";
