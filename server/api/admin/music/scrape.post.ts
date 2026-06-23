import { createScraper, type Platform } from "#server/utils/scraper";

const VALID_PLATFORMS = ["kuwo", "qq", "netease"] as const;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { action, platform, keyword, sourceId } = body;

  if (!action || !["search", "detail"].includes(action)) {
    throw createError({ statusCode: 400, message: "无效的操作类型" });
  }

  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    throw createError({ statusCode: 400, message: "无效的平台" });
  }

  const scraper = createScraper(platform as Platform);

  if (action === "search") {
    if (!keyword?.trim()) {
      throw createError({ statusCode: 400, message: "搜索关键词不能为空" });
    }
    const results = await scraper.search(keyword.trim());
    return { success: true, results };
  }

  if (action === "detail") {
    if (!sourceId) {
      throw createError({ statusCode: 400, message: "缺少 sourceId" });
    }
    const result = await scraper.detail(sourceId);
    return { success: true, result };
  }

  throw createError({ statusCode: 405, message: "不支持的操作" });
});
