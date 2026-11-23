-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN     "glAccount" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "exportBatchId" TEXT;

-- CreateTable
CREATE TABLE "AccountingExport" (
    "id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "payments" INTEGER NOT NULL DEFAULT 0,
    "lines" INTEGER NOT NULL DEFAULT 0,
    "total" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingExport_createdAt_idx" ON "AccountingExport"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_exportBatchId_idx" ON "Payment"("exportBatchId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exportBatchId_fkey" FOREIGN KEY ("exportBatchId") REFERENCES "AccountingExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExport" ADD CONSTRAINT "AccountingExport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sensible default ledgers for the standard categories (editable in Administration).
UPDATE "ExpenseCategory" SET "glAccount" = CASE code
  WHEN 'AIRFARE'  THEN 'Travel - Airfare'
  WHEN 'RAIL'     THEN 'Travel - Rail & Bus'
  WHEN 'LODGING'  THEN 'Travel - Lodging'
  WHEN 'MEALS'    THEN 'Travel - Meals'
  WHEN 'TAXI'     THEN 'Local Conveyance'
  WHEN 'VISA'     THEN 'Travel - Visa & Fees'
  WHEN 'CLIENT'   THEN 'Business Promotion'
  WHEN 'INTERNET' THEN 'Telephone & Internet'
  WHEN 'MISC'     THEN 'Miscellaneous Expenses'
END
WHERE "glAccount" IS NULL;
