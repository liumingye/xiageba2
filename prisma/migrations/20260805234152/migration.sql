-- CreateIndex
CREATE INDEX "Source_cid_createdAt_idx" ON "Source"("cid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Source_createdAt_idx" ON "Source"("createdAt" DESC);
