CREATE EXTENSION IF NOT EXISTS btree_gin;

-- =========================================================
-- 清理冗余/过时索引
-- =========================================================

-- 删除全表 GIN 索引（已由带条件的部分复合 GIN 索引替代）
DROP INDEX IF EXISTS "Source_searchVector_idx";
DROP INDEX IF EXISTS "Source_active_searchVector_idx";

-- 删除过渡方案中的函数计算索引（如果之前创建过的话）
DROP INDEX IF EXISTS "Source_url_host_active_idx";
DROP INDEX IF EXISTS "Source_search";
DROP INDEX IF EXISTS "Source_isSelf_idx";
DROP INDEX IF EXISTS "Source_status_idx";
DROP INDEX IF EXISTS "Source_createdAt_idx";
DROP INDEX IF EXISTS "Source_url_idx";

-- =========================================================
-- 创建最终核心索引
-- =========================================================

-- 确保索引定义中的表达式与 SQL 完全逐字对应
CREATE INDEX "Source_search" 
ON "Source" USING gin (
  (split_part(split_part(url, '//'::text, 2), '/'::text, 1)), 
  "searchVector"
) 
WHERE "isTemp" = false AND status = 1;

CREATE INDEX "Source_temp_url_created_idx" 
ON "Source" (url varchar_pattern_ops, "createdAt") 
WHERE "isTemp" = true;

CREATE INDEX "Source_active_count_idx" 
ON "Source" (id) 
WHERE "isTemp" = false AND status = 1;
