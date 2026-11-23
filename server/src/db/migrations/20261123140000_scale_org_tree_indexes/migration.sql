-- DropIndex
DROP INDEX "ExpenseReport_status_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ancestors" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "ApprovalStep_status_dueAt_idx" ON "ApprovalStep"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ApprovalStep_actedById_actedAt_idx" ON "ApprovalStep"("actedById", "actedAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseLine_date_idx" ON "ExpenseLine"("date");

-- CreateIndex
CREATE INDEX "ExpenseReport_status_approvedAt_idx" ON "ExpenseReport"("status", "approvedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- CreateIndex
CREATE INDEX "TravelRequest_status_startDate_idx" ON "TravelRequest"("status", "startDate");

-- CreateIndex
CREATE INDEX "User_ancestors_idx" ON "User" USING GIN ("ancestors");

-- CreateIndex
CREATE INDEX "User_active_name_idx" ON "User"("active", "name");


-- Backfill the materialised reporting path for existing users.
WITH RECURSIVE tree AS (
  SELECT id, ARRAY[]::TEXT[] AS anc FROM "User" WHERE "managerId" IS NULL
  UNION ALL
  SELECT u.id, tree.anc || u."managerId" FROM "User" u JOIN tree ON u."managerId" = tree.id
)
UPDATE "User" SET "ancestors" = tree.anc FROM tree WHERE "User".id = tree.id;
