-- AlterTable
ALTER TABLE "Admin" ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Feedback" ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Music" ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "invalidNum" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isTemp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ALTER COLUMN "updatedAt" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Source_status_idx" ON "Source"("status");
