import { prisma } from "#server/lib/prisma";

interface AdFilterConfig {
  enabled: boolean;
  keywords: string;
}

const DEFAULT_CONFIG: AdFilterConfig = {
  enabled: false,
  keywords: "",
};

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const config = await prisma.config.findUnique({
      where: { key: "ad_filter" },
    });
    let data: AdFilterConfig = { ...DEFAULT_CONFIG };
    if (config?.value) {
      try {
        const parsed = JSON.parse(config.value);
        data = { ...DEFAULT_CONFIG, ...parsed };
      } catch {
        data = { ...DEFAULT_CONFIG };
      }
    }
    return { data };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const enabled = Boolean(body.enabled);
    const keywords = (body.keywords || "").toString().trim();

    const data: AdFilterConfig = { enabled, keywords };

    await prisma.config.upsert({
      where: { key: "ad_filter" },
      update: { value: JSON.stringify(data) },
      create: { key: "ad_filter", value: JSON.stringify(data) },
    });

    return { success: true, data };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
