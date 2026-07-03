import { prisma } from "#server/lib/prisma";
import { clearConfigCache, getConfigValues } from "#server/lib/configCache";

const REDIS_KEYS = ["redis_host", "redis_port", "redis_db", "redis_password"];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues(REDIS_KEYS);
    return { data: result };
  }

  if (method === "POST") {
    const body = await readBody(event);

    const upserts = [];
    for (const key of REDIS_KEYS) {
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
      clearConfigCache();
    }

    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
