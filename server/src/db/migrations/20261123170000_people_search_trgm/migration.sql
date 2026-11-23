CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- DropIndex
DROP INDEX "User_active_name_idx";

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_email_trgm_idx" ON "User" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_employeeId_trgm_idx" ON "User" USING GIN ("employeeId" gin_trgm_ops);

