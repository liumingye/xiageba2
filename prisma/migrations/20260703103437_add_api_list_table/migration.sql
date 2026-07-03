-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "searchVector" tsvector;

-- CreateTable
CREATE TABLE "ApiList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'api',
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "headers" TEXT NOT NULL DEFAULT '{}',
    "fixed_params" TEXT NOT NULL DEFAULT '{}',
    "field_map" TEXT NOT NULL DEFAULT '{}',
    "count" INTEGER NOT NULL DEFAULT 10,
    "html_item" TEXT NOT NULL DEFAULT '',
    "html_title" TEXT NOT NULL DEFAULT '',
    "html_url" INTEGER NOT NULL DEFAULT 0,
    "html_type" TEXT NOT NULL DEFAULT '',
    "html_url2" TEXT NOT NULL DEFAULT '',
    "weight" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiList_status_idx" ON "ApiList"("status");

-- CreateIndex
CREATE INDEX "ApiList_weight_idx" ON "ApiList"("weight");

-- CreateIndex
CREATE INDEX "Source_searchVector_idx" ON "Source" USING GIN ("searchVector");
