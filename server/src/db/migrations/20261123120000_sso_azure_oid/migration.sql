-- AlterTable
ALTER TABLE "User" ADD COLUMN     "azureOid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_azureOid_key" ON "User"("azureOid");

