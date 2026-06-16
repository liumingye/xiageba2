-- PostgreSQL 中文全文检索 FTS（无扩展，纯 PG 内置）
-- 字符 bigram 分词，存进 tsvector + GIN 索引
-- 例如 "周杰伦" → token: 周 杰 伦 周杰 杰伦
-- 查询 "杰伦" → to_tsquery('simple', '杰伦') 命中 bigram token

-- 0. 添加 searchVector 列
ALTER TABLE "Music" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- 1. bigram 拆分函数
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

  FOR i IN 1..ch_len LOOP
    ch := substring(input FROM i FOR 1);
    IF ch <> ' ' THEN
      parts := array_append(parts, ch);
    END IF;
  END LOOP;

  FOR i IN 1..ch_len - 1 LOOP
    bi := substring(input FROM i FOR 2);
    IF bi NOT LIKE '% %' THEN
      parts := array_append(parts, bi);
    END IF;
  END LOOP;

  RETURN array_to_string(parts, ' ');
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- 2. 触发器：写入/更新时自动同步 searchVector
DROP TRIGGER IF EXISTS music_search_vector_trigger ON "Music";
DROP FUNCTION IF EXISTS music_search_vector_update();

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

-- 3. 为已有数据填充 searchVector
UPDATE "Music"
SET "searchVector" = to_tsvector(
  'simple',
  chinese_bigram(COALESCE(title, ''))  || ' ' ||
  chinese_bigram(COALESCE(artist, '')) || ' ' ||
  chinese_bigram(COALESCE(album, ''))
);

-- 4. GIN 索引
CREATE INDEX IF NOT EXISTS idx_music_search_vector ON "Music" USING GIN ("searchVector");

-- 5. 统计信息
ANALYZE "Music";
