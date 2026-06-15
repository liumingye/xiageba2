-- PostgreSQL 全文检索触发器
-- 运行此脚本创建自动同步 searchVector 的函数和触发器

-- 删除已存在的触发器和函数（如果存在）
DROP TRIGGER IF EXISTS music_search_vector_trigger ON "Music";
DROP FUNCTION IF EXISTS music_search_vector_update();

-- 创建函数：自动更新 searchVector
CREATE OR REPLACE FUNCTION music_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector(
    'simple',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.artist, '') || ' ' ||
    COALESCE(NEW.album, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器：在 INSERT 或 UPDATE 时自动调用
CREATE TRIGGER music_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, artist, album ON "Music"
FOR EACH ROW
EXECUTE FUNCTION music_search_vector_update();

-- 为已存在的数据初始化 searchVector
UPDATE "Music" SET "searchVector" = to_tsvector(
  'simple',
  COALESCE(title, '') || ' ' ||
  COALESCE(artist, '') || ' ' ||
  COALESCE(album, '')
);
