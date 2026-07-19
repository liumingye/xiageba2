import { prisma } from "#server/lib/prisma";

interface AiSearchConfig {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
}

const DEFAULT_CONFIG: AiSearchConfig = {
  enabled: false,
  baseURL: "",
  apiKey: "",
  model: "",
};

export async function getAiSearchConfig(): Promise<AiSearchConfig> {
  const config = await prisma.config.findUnique({
    where: { key: "ai_search" },
  });
  if (!config?.value) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(config.value) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const data = await getAiSearchConfig();
    return { data };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const enabled = Boolean(body.enabled);
    const baseURL = (body.baseURL || "").toString().trim();
    const apiKey = (body.apiKey || "").toString().trim();
    const model = (body.model || "").toString().trim();

    const data: AiSearchConfig = { enabled, baseURL, apiKey, model };

    await prisma.config.upsert({
      where: { key: "ai_search" },
      update: { value: JSON.stringify(data) },
      create: { key: "ai_search", value: JSON.stringify(data) },
    });

    return { success: true, data };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
