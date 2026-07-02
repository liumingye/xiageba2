/*
  Warnings:

  - The `status` column on the `Source` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Source" DROP COLUMN "status",
ADD COLUMN     "status" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "fid" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Source_status_idx" ON "Source"("status");
