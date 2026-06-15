/*
  Warnings:

  - Made the column `id` on table `Admin` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `Admin` required. This step will fail if there are existing NULL values in that column.
  - Made the column `album` on table `Music` required. This step will fail if there are existing NULL values in that column.
  - Made the column `cover` on table `Music` required. This step will fail if there are existing NULL values in that column.
  - Made the column `flacUrl` on table `Music` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `Music` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lyrics` on table `Music` required. This step will fail if there are existing NULL values in that column.
  - Made the column `mp3Url` on table `Music` required. This step will fail if there are existing NULL values in that column.
  - Made the column `playUrl` on table `Music` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `Music` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Admin" ("createdAt", "id", "password", "updatedAt", "username") SELECT coalesce("createdAt", CURRENT_TIMESTAMP) AS "createdAt", "id", "password", "updatedAt", "username" FROM "Admin";
DROP TABLE "Admin";
ALTER TABLE "new_Admin" RENAME TO "Admin";
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");
CREATE TABLE "new_Music" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT NOT NULL,
    "cover" TEXT NOT NULL,
    "lyrics" TEXT NOT NULL,
    "flacUrl" TEXT NOT NULL,
    "mp3Url" TEXT NOT NULL,
    "playUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Music" ("album", "artist", "cover", "createdAt", "flacUrl", "id", "lyrics", "mp3Url", "playUrl", "title", "updatedAt") SELECT "album", "artist", "cover", coalesce("createdAt", CURRENT_TIMESTAMP) AS "createdAt", "flacUrl", "id", "lyrics", "mp3Url", "playUrl", "title", "updatedAt" FROM "Music";
DROP TABLE "Music";
ALTER TABLE "new_Music" RENAME TO "Music";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
