
-- 创建 S3Config（id 改为 SERIAL 自增 INT）
CREATE TABLE "S3Config" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "baseUrl" VARCHAR(2048) NOT NULL DEFAULT '',
    "bucket" VARCHAR(255) NOT NULL,
    "prefix" VARCHAR(255) NOT NULL DEFAULT '',
    "endpoint" VARCHAR(2048) NOT NULL DEFAULT '',
    "region" VARCHAR(100) NOT NULL DEFAULT '',
    "accessKey" VARCHAR(255) NOT NULL,
    "secretKey" VARCHAR(255) NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "S3Config_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "S3Config_isHidden_idx" ON "S3Config"("isHidden");

-- 创建 StorageFile（configId 改为 INTEGER）
CREATE TABLE "StorageFile" (
    "id" VARCHAR(32) NOT NULL,
    "configId" INTEGER NOT NULL,
    "path" VARCHAR(2048) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mimeType" VARCHAR(100) NOT NULL DEFAULT '',
    "url" VARCHAR(2048) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StorageFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorageFile_configId_idx" ON "StorageFile"("configId");
CREATE INDEX "StorageFile_path_idx" ON "StorageFile"("path");
CREATE INDEX "StorageFile_name_idx" ON "StorageFile"("name");
CREATE INDEX "StorageFile_isDeleted_idx" ON "StorageFile"("isDeleted");
CREATE INDEX "StorageFile_createdAt_idx" ON "StorageFile"("createdAt");

ALTER TABLE "StorageFile"
    ADD CONSTRAINT "StorageFile_configId_fkey"
    FOREIGN KEY ("configId")
    REFERENCES "S3Config"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
