-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT "project_documents_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT "project_documents_createdById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_projectId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_stageInstanceId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_createdById_fkey";

-- DropTable
DROP TABLE "purchase_orders";

-- DropTable
DROP TABLE "suppliers";

-- DropTable
DROP TABLE "project_documents";

-- DropEnum
DROP TYPE "PurchaseOrderStatus";
