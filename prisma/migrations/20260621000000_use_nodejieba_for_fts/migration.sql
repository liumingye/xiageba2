-- 切换到应用层（nodejieba）分词：
-- 1) 移除 PL/pgSQL 的 chinese_bigram 函数及相关触发器
-- 2) 保留 searchVector 列和 GIN 索引
-- 3) 用旧的 chinese_bigram 临时重建已有数据的 searchVector
--    （确保迁移后旧数据仍可搜索，不影响业务）
--    之后由管理员调用 POST /api/admin/music/rebuild-search 用 jieba 全面刷新
--
-- 新的搜索/写入逻辑在 Node 侧使用 nodejieba 分词：
--   INSERT/UPDATE 时显式写入 searchVector = to_tsvector('simple', <tokens>)
--   搜索时使用 plainto_tsquery('simple', <tokens>)

-- 1. 移除旧的触发器和函数（等已有数据重建后再删）
DROP TRIGGER IF EXISTS music_search_vector_trigger ON "Music";
DROP FUNCTION IF EXISTS music_search_vector_update();

-- 2. 用旧 chinese_bigram 重建已有数据的 searchVector（兜底，不删除旧函数）
UPDATE "Music"
SET "searchVector" = to_tsvector(
  'simple',
  chinese_bigram(COALESCE(title, ''))  || ' ' ||
  chinese_bigram(COALESCE(artist, '')) || ' ' ||
  chinese_bigram(COALESCE(album, ''))
)
WHERE "searchVector" IS NULL;

-- 3. 重建 GIN 索引
DROP INDEX IF EXISTS idx_music_search_vector;
CREATE INDEX IF NOT EXISTS idx_music_search_vector ON "Music" USING GIN ("searchVector");

ANALYZE "Music";
