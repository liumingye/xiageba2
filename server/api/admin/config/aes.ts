import { prisma } from "#server/lib/prisma";
import { clearConfigCache, getConfigValues } from "#server/lib/configCache";

const AES_KEYS = ["aes_key", "aes_iv"];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues(AES_KEYS);
    return { data: result };
  }

  if (method === "POST") {
    const body = await readBody(event);

    const upserts = [];
    for (const key of AES_KEYS) {
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
