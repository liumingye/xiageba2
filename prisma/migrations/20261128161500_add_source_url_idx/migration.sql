-- 批量导入按 url 精确去重（url IN (...)），此前没有索引，每次导入都是全表扫描。
-- Source 约 130 万行：普通 CREATE INDEX 会在建索引期间阻塞对 Source 的写入（不影响读取），
-- 容器部署时迁移先于应用启动执行，因此无影响；对正在服务的实例执行迁移请选低峰期。
CREATE INDEX "Source_url_idx" ON "Source"("url");
