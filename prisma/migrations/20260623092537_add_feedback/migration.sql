-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BROKEN_LINK', 'WRONG_CONTENT', 'WRONG_CODE', 'WRONG_QUALITY', 'WRONG_INFO');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'DONE');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "musicId" TEXT NOT NULL,
    "musicTitle" TEXT NOT NULL,
    "musicArtist" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_musicId_idx" ON "Feedback"("musicId");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");
