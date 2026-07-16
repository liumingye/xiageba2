-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "isSelf" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Source_isSelf_idx" ON "Source"("isSelf");
