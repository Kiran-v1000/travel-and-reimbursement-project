-- CreateIndex
CREATE INDEX "ExpenseReport_updatedAt_idx" ON "ExpenseReport"("updatedAt");

-- CreateIndex
CREATE INDEX "TravelRequest_updatedAt_idx" ON "TravelRequest"("updatedAt");


-- Guard rails: no single query or abandoned transaction can hold a pooled connection forever.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET statement_timeout = %L', current_database(), '30s');
  EXECUTE format('ALTER DATABASE %I SET idle_in_transaction_session_timeout = %L', current_database(), '60s');
END $$;
