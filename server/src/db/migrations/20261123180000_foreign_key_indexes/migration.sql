-- CreateIndex
CREATE INDEX "Attachment_travelRequestId_idx" ON "Attachment"("travelRequestId");

-- CreateIndex
CREATE INDEX "Attachment_expenseLineId_idx" ON "Attachment"("expenseLineId");

-- CreateIndex
CREATE INDEX "ExpenseReport_travelRequestId_idx" ON "ExpenseReport"("travelRequestId");

