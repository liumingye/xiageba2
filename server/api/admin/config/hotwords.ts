import { prisma } from "#server/lib/prisma";

type HotWordType = "music" | "resource";

interface HotWord {
  word: string;
  weight: number;
  type: HotWordType;
}

const VALID_TYPES: HotWordType[] = ["music", "resource"];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const config = await prisma.config.findUnique({
      where: { key: "hotwords" },
    });
    let hotwords: HotWord[] = [];
    if (config?.value) {
      try {
        hotwords = JSON.parse(config.value);
      } catch {
        hotwords = [];
      }
    }
    return { data: hotwords };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const hotwords = (body.hotwords || []) as HotWord[];

    const filtered = hotwords
      .filter((h) => h.word && h.word.trim())
      .map((h) => ({
        word: h.word.trim(),
        weight: Math.max(1, Math.min(999, parseInt(h.weight + "") || 1)),
        type: VALID_TYPES.includes(h.type) ? h.type : "music",
      }))
      .sort((a, b) => b.weight - a.weight);

    await prisma.config.upsert({
      where: { key: "hotwords" },
      update: { value: JSON.stringify(filtered) },
      create: { key: "hotwords", value: JSON.stringify(filtered) },
    });

    return { success: true, data: filtered };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
