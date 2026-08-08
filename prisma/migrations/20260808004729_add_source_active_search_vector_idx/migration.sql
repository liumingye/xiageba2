CREATE INDEX IF NOT EXISTS "Source_active_searchVector_idx" 
ON "Source" USING gin ("searchVector") 
WHERE "isTemp" = false AND status = 1;