-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "cid" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "menu" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Category_sort_idx" ON "Category"("sort");

-- CreateIndex
CREATE INDEX "Source_cid_idx" ON "Source"("cid");

-- CreateIndex
CREATE INDEX "Source_createdAt_idx" ON "Source"("createdAt");
