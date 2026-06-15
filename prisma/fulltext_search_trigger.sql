-- PostgreSQL 中文全文检索 FTS（无扩展，纯 PG 内置）
-- 思路：把 title/artist/album 拆成字符 bigram，存进 tsvector + GIN 索引
-- 例如 "周杰伦" → 拆成 token: 周 杰 伦 周杰 杰伦
-- 查询 "杰伦" → to_tsquery('simple', '杰伦') — 命中 "周杰伦" 的 bigram token

-- 1. bigram 拆分函数（IMMUTABLE，可用于索引与触发器）
DROP FUNCTION IF EXISTS chinese_bigram(text);
CREATE OR REPLACE FUNCTION chinese_bigram(text) RETURNS text AS $$
DECLARE
  input   text    := COALESCE($1, '');
  ch_len  integer := char_length(input);
  parts   text[]  := ARRAY[]::text[];
  i       integer;
  ch      text;
  bi      text;
BEGIN
  IF ch_len = 0 THEN
    RETURN '';
  END IF;

  -- 单字符 token：匹配精确字
  FOR i IN 1..ch_len LOOP
    ch := substring(input FROM i FOR 1);
    IF ch <> ' ' THEN
      parts := array_append(parts, ch);
    END IF;
  END LOOP;

  -- bigram token：支持子串匹配（"杰伦" 命中 "周杰伦"）
  FOR i IN 1..ch_len - 1 LOOP
    bi := substring(input FROM i FOR 2);
    IF bi NOT LIKE '% %' THEN
      parts := array_append(parts, bi);
    END IF;
  END LOOP;

  RETURN array_to_string(parts, ' ');
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;


-- 2. 清理旧索引与触发器
DROP INDEX IF EXISTS idx_music_search_vector;
DROP INDEX IF EXISTS idx_music_title_ngrams;
DROP INDEX IF EXISTS idx_music_artist_ngrams;
DROP INDEX IF EXISTS idx_music_album_ngrams;
DROP TRIGGER IF EXISTS music_search_vector_trigger ON "Music";
DROP FUNCTION IF EXISTS music_search_vector_update();


-- 3. 触发器：写入时自动把 title/artist/album 转成 bigram tsvector
CREATE OR REPLACE FUNCTION music_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector(
    'simple',
    chinese_bigram(COALESCE(NEW.title, ''))  || ' ' ||
    chinese_bigram(COALESCE(NEW.artist, '')) || ' ' ||
    chinese_bigram(COALESCE(NEW.album, ''))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER music_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, artist, album ON "Music"
FOR EACH ROW
EXECUTE FUNCTION music_search_vector_update();


-- 4. 对已有数据全量更新 searchVector
UPDATE "Music"
SET "searchVector" = to_tsvector(
  'simple',
  chinese_bigram(COALESCE(title, ''))  || ' ' ||
  chinese_bigram(COALESCE(artist, '')) || ' ' ||
  chinese_bigram(COALESCE(album, ''))
);


-- 5. 在 searchVector 上建 GIN 索引（真正走 PG FTS 索引，O(log n)）
CREATE INDEX idx_music_search_vector ON "Music" USING GIN ("searchVector");


-- 6. 更新统计信息，让查询计划器正确选择索引
ANALYZE "Music";
