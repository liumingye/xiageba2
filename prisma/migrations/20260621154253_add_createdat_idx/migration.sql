-- AlterTable
ALTER TABLE "Admin" RENAME CONSTRAINT "idx_admin_id" TO "Admin_pkey";

-- AlterTable
ALTER TABLE "Music" RENAME CONSTRAINT "idx_music_id" TO "Music_pkey";

-- CreateIndex
CREATE INDEX "Music_createdAt_idx" ON "Music"("createdAt");

-- RenameIndex
ALTER INDEX "idx_admin_username" RENAME TO "Admin_username_key";

-- RenameIndex
ALTER INDEX "idx_music_search_vector" RENAME TO "Music_searchVector_idx";
