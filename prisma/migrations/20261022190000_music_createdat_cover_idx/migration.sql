DROP INDEX "Music_createdAt_idx";

CREATE INDEX CONCURRENTLY "Music_createdAt_idx"
ON public."Music" ("createdAt" DESC) INCLUDE (id);
