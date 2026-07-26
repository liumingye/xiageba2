-- 1. 先删除原有 text 类型的默认值
ALTER TABLE "Music" ALTER COLUMN "downloads" DROP DEFAULT;

-- 2. 将字段显式转为 text 后再进行合法性判断与转换
ALTER TABLE "Music" 
  ALTER COLUMN "downloads" TYPE JSONB 
  USING (
    CASE 
      -- 先统一当作 text 处理：如果是 NULL、空串、单个引号或者不是合法 JSON，统一给 []
      WHEN "downloads" IS NULL 
        OR trim("downloads"::text) = '' 
        OR trim("downloads"::text) = '"' 
        OR NOT (pg_input_is_valid(trim("downloads"::text), 'jsonb'))
      THEN '[]'::jsonb
      
      -- 校验通过的合法 JSON 字符串才转 jsonb
      ELSE trim("downloads"::text)::jsonb
    END
  );

-- 3. 重新设置新的 JSONB 默认值和非空约束
ALTER TABLE "Music" 
  ALTER COLUMN "downloads" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "downloads" SET NOT NULL;
