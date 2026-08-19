-- =========================================================
-- 临时转存资源表（替代 Source.isTemp 方案）
-- =========================================================
CREATE TABLE "SourceTemp" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "fid" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceTemp_pkey" PRIMARY KEY ("id")
);

-- =========================================================
-- 删除引用 isTemp 的部分索引（列删除后无法保留）
-- =========================================================
DROP INDEX IF EXISTS "Source_search";
DROP INDEX IF EXISTS "Source_temp_url_created_idx";
DROP INDEX IF EXISTS "Source_active_count_idx";
DROP INDEX IF EXISTS "Source_active_searchVector_idx";

-- =========================================================
-- 移除 Source 的临时资源字段（临时资源统一迁往 SourceTemp 表）
-- =========================================================
ALTER TABLE "Source" DROP COLUMN "isTemp";
ALTER TABLE "Source" DROP COLUMN "fid";

-- =========================================================
-- 按新结构重建核心索引（去掉 isTemp 条件）
-- =========================================================
CREATE INDEX "Source_search" 
ON "Source" USING gin (
  (split_part(split_part(url, '//'::text, 2), '/'::text, 1)), 
  "searchVector"
) 
WHERE status = 1;

CREATE INDEX "Source_active_count_idx" 
ON "Source" (id) 
WHERE status = 1;

CREATE INDEX "Source_active_searchVector_idx" 
ON "Source" USING gin ("searchVector") 
WHERE status = 1;

-- 临时资源清理按 createdAt 批量查询
CREATE INDEX "SourceTemp_createdAt_idx" 
ON "SourceTemp" ("createdAt");
