-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'USERS',
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

