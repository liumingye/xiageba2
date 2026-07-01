import { prisma } from "#server/lib/prisma";
import { clearConfigCache, getConfigValues } from "#server/lib/configCache";

const ACCOUNT_KEYS = [
  "quark_cookie",
  "quark_temp_dir",
  "baidu_cookie",
  "baidu_temp_dir",
  "uc_cookie",
  "uc_temp_dir",
  "xunlei_refresh_token",
  "xunlei_temp_dir",
];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues(ACCOUNT_KEYS);
    return { data: result };
  }

  if (method === "POST") {
    const body = await readBody(event);

    const upserts = [];
    for (const key of ACCOUNT_KEYS) {
      if (body && body[key] !== undefined) {
        upserts.push(
          prisma.config.upsert({
            where: { key },
            update: { value: String(body[key] || "") },
            create: { key, value: String(body[key] || "") },
          }),
        );
      }
    }

    if (upserts.length > 0) {
      await Promise.all(upserts);
      // 更新数据后清空缓存
      clearConfigCache();
    }
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
