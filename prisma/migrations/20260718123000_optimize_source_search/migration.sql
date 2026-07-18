-- Public source searches always exclude temporary and disabled records.
-- Keeping that predicate in the GIN index reduces both index size and heap reads.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Source_active_searchVector_idx"
ON "Source" USING GIN ("searchVector")
WHERE "isTemp" = false AND "status" = 1;
