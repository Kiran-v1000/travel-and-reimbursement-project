-- CreateEnum
CREATE TYPE "HoldScope" AS ENUM ('EMPLOYEE', 'EXPENSE', 'TRAVEL', 'PERIOD');

-- AlterTable
ALTER TABLE "ExpenseReport" ADD COLUMN     "purgedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TravelRequest" ADD COLUMN     "purgedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "scope" "HoldScope" NOT NULL,
    "userId" TEXT,
    "entityId" TEXT,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "subject" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "placedById" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "expenses" INTEGER NOT NULL DEFAULT 0,
    "trips" INTEGER NOT NULL DEFAULT 0,
    "files" INTEGER NOT NULL DEFAULT 0,
    "bytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "skippedOnHold" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalHold_releasedAt_scope_idx" ON "LegalHold"("releasedAt", "scope");

-- CreateIndex
CREATE INDEX "LegalHold_userId_idx" ON "LegalHold"("userId");

-- CreateIndex
CREATE INDEX "LegalHold_entityId_idx" ON "LegalHold"("entityId");

-- CreateIndex
CREATE INDEX "RetentionRun_startedAt_idx" ON "RetentionRun"("startedAt");

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRun" ADD CONSTRAINT "RetentionRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Only one retention run at a time, across every API server.
CREATE UNIQUE INDEX "RetentionRun_one_running" ON "RetentionRun" ("status") WHERE "status" = 'RUNNING';

-- Retention candidates: only records not yet purged are ever scanned.
CREATE INDEX "ExpenseReport_retention_idx" ON "ExpenseReport" ("updatedAt") WHERE "purgedAt" IS NULL;
CREATE INDEX "TravelRequest_retention_idx" ON "TravelRequest" ("updatedAt") WHERE "purgedAt" IS NULL;

-- Automatic purging is off until an administrator switches it on.
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('retentionAutoPurge', 'false'::jsonb, now()) ON CONFLICT ("key") DO NOTHING;
