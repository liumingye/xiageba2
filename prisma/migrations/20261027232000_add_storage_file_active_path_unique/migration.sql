-- 同一配置下 (configId, path) 的「未软删除」记录必须唯一。
--
-- 之前只有普通索引 @@index([path])：两个并发改名/上传可以同时通过
-- 「目标文件名是否被占用」的检查，各自写入，结果两条记录指向同一个对象、
-- 内容互相覆盖，且系统里没有任何地方报错。
--
-- 必须是**部分**唯一索引（只约束 isDeleted = false 的行）：
-- 文件软删除后仍保留记录，若用完整唯一约束，删掉文件后重新上传同名文件会直接失败。
-- Prisma schema 无法表达部分索引，所以只能放在这里；schema.prisma 的 StorageFile
-- 上有对应注释说明不要改成 @@unique。
--
-- 迁移会先检查历史数据：存在重复时抛异常并整体回滚，不会留下半成品索引。
-- 处理方式：
--   SELECT "configId", path, count(*) FROM "StorageFile"
--   WHERE "isDeleted" = false GROUP BY 1,2 HAVING count(*) > 1;
-- 保留一条（通常是 createdAt 最大的），其余置 isDeleted = true 后重跑本迁移。

DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT count(*) INTO dup_groups
  FROM (
    SELECT 1
    FROM "StorageFile"
    WHERE "isDeleted" = false
    GROUP BY "configId", path
    HAVING count(*) > 1
  ) AS d;

  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'StorageFile 存在 % 组重复的 (configId, path) 活跃记录，无法建立唯一索引；请先清理重复记录再重试本迁移。',
      dup_groups;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "StorageFile_configId_path_active_key"
  ON "StorageFile" ("configId", path)
  WHERE "isDeleted" = false;
