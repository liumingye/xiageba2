-- CreateEnum
CREATE TYPE "AnnouncementDisplay" AS ENUM ('NORMAL', 'BANNER', 'DIALOG');

-- CreateEnum
CREATE TYPE "AnnouncementIcon" AS ENUM ('INFO', 'WARN', 'ERROR', 'SUCCESS');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "displayType" "AnnouncementDisplay" NOT NULL DEFAULT 'NORMAL',
    "icon" "AnnouncementIcon" NOT NULL DEFAULT 'INFO',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_status_idx" ON "Announcement"("status");

-- CreateIndex
CREATE INDEX "Announcement_displayType_idx" ON "Announcement"("displayType");

-- CreateIndex
CREATE INDEX "Announcement_sort_idx" ON "Announcement"("sort");

-- CreateIndex
CREATE INDEX "Announcement_createdAt_idx" ON "Announcement"("createdAt");
