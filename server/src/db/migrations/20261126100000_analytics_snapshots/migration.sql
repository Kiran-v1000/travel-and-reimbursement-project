-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "computeMs" INTEGER NOT NULL,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_computedAt_idx" ON "AnalyticsSnapshot"("computedAt");

