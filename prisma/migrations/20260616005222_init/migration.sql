-- CreateTable
CREATE TABLE "Music" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT NOT NULL,
    "cover" TEXT NOT NULL,
    "lyrics" TEXT NOT NULL,
    "playUrl" TEXT NOT NULL,
    "downloads" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector,

    CONSTRAINT "idx_music_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idx_admin_id" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_music_search_vector" ON "Music" USING GIN ("searchVector");

-- CreateIndex
CREATE UNIQUE INDEX "idx_admin_username" ON "Admin"("username");
