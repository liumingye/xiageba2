-- 修复中文全文搜索：chinese_bigram() 过滤标点字符
-- 之前把 ，()& 等符号当成字符生成 token，导致 to_tsquery/plainto_tsquery 解析失败
-- 新函数：只保留 ASCII 字母数字 + CJK 汉字，其余字符全部替换为空格

-- 1. 重建 bigram 函数（用新实现替换旧版）
DROP FUNCTION IF EXISTS chinese_bigram(text) CASCADE;

CREATE OR REPLACE FUNCTION chinese_bigram(input_text text) RETURNS text AS $$
DECLARE
  clean_text text := '';
  ch_len     integer;
  parts      text[] := ARRAY[]::text[];
  i          integer;
  ch         text;
  ch_code    integer;
  bi         text;
BEGIN
  input_text := COALESCE(input_text, '');
  ch_len := char_length(input_text);

  -- 第一遍：逐字检查，仅保留字母数字和 CJK 汉字，其余替换为空格
  FOR i IN 1..ch_len LOOP
    ch := substring(input_text FROM i FOR 1);
    ch_code := ascii(ch);

    IF (ch_code >= 48  AND ch_code <= 57)   -- 0-9
       OR (ch_code >= 65  AND ch_code <= 90)   -- A-Z
       OR (ch_code >= 97  AND ch_code <= 122)  -- a-z
       OR (ch_code >= 19968 AND ch_code <= 40959) -- CJK Unified Ideographs (U+4E00..U+9FFF)
    THEN
      clean_text := clean_text || ch;
    ELSE
      clean_text := clean_text || ' ';
    END IF;
  END LOOP;

  -- 合并连续空格，首尾去空白
  clean_text := regexp_replace(clean_text, '[ ]+', ' ', 'g');
  clean_text := btrim(clean_text);

  ch_len := char_length(clean_text);
  IF ch_len = 0 THEN
    RETURN '';
  END IF;

  -- 单字 tokens（跳过空格）
  FOR i IN 1..ch_len LOOP
    ch := substring(clean_text FROM i FOR 1);
    IF ch <> ' ' THEN
      parts := array_append(parts, ch);
    END IF;
  END LOOP;

  -- 双字 bigram tokens（如果不含空格）
  FOR i IN 1..ch_len - 1 LOOP
    bi := substring(clean_text FROM i FOR 2);
    IF bi NOT LIKE '% %' THEN
      parts := array_append(parts, bi);
    END IF;
  END LOOP;

  RETURN array_to_string(parts, ' ');
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- 2. 重建触发器函数
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

-- 3. 重建所有数据的 searchVector（应用新的 bigram 规则）
UPDATE "Music"
SET "searchVector" = to_tsvector(
  'simple',
  chinese_bigram(COALESCE(title, ''))  || ' ' ||
  chinese_bigram(COALESCE(artist, '')) || ' ' ||
  chinese_bigram(COALESCE(album, ''))
);

-- 4. 重建 GIN 索引（旧索引含噪音 token，重建后更干净更小）
DROP INDEX IF EXISTS idx_music_search_vector;
CREATE INDEX IF NOT EXISTS idx_music_search_vector ON "Music" USING GIN ("searchVector");

ANALYZE "Music";
