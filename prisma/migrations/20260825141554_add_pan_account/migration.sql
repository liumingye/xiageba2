-- AlterTable
ALTER TABLE "SourceTemp" ADD COLUMN     "accountId" INTEGER;

-- CreateTable
CREATE TABLE "PanAccount" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "cookie" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMPTZ(3),
    "tempDir" VARCHAR(255) NOT NULL DEFAULT '',
    "status" SMALLINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PanAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PanAccount_type_idx" ON "PanAccount"("type");

-- CreateIndex
CREATE INDEX "PanAccount_status_idx" ON "PanAccount"("status");

-- CreateIndex
CREATE INDEX "SourceTemp_accountId_idx" ON "SourceTemp"("accountId");
