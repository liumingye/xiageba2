import { testWebSearchConfig } from "#server/lib/webSearch";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = body.config;
  const keyword = String(body.keyword || "凡人修仙传");

  if (!config) {
    throw createError({ statusCode: 400, message: "缺少配置" });
  }
  if (!config.url) {
    throw createError({ statusCode: 400, message: "地址不能为空" });
  }

  try {
    const count = await testWebSearchConfig(config, keyword);
    return { success: true, count, keyword };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "测试失败",
      keyword,
    };
  }
});
