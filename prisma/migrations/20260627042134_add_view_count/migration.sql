-- AlterTable
ALTER TABLE "Music" ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Music_viewCount_idx" ON "Music"("viewCount");
