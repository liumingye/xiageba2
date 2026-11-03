import { getRebuildStatus } from "#server/lib/rebuild-search";

/**
 * 获取当前后台全文索引的重建进度
 * GET /api/admin/music/rebuild-status
 *
 * 实际逻辑（Redis 缓存读取 + idle 回落）在 lib 单点维护，
 * 与 source 端点共用；这里只指定目标。
 */
export default defineEventHandler(async () => getRebuildStatus("music"));
