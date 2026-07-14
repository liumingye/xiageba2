import { prisma } from "#server/lib/prisma";

type HotWordType = "music" | "resource";

interface HotWord {
  word: string;
  weight: number;
  type: HotWordType;
}

export default defineEventHandler(async () => {
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
});
