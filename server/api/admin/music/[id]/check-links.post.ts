import "dotenv/config";
import { prisma } from "#server/lib/prisma";
import { resolveLinkStatus, submitCheckRequest } from "#server/lib/pan-check";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少音乐ID" });
  }

  const music = await prisma.music.findUnique({
    where: { id },
  });

  if (!music) {
    throw createError({ statusCode: 404, message: "音乐不存在" });
  }

  const downloads = (music.downloads || []) as Array<{
    quality: string;
    url: string;
  }>;

  const links = downloads.map((d) => d.url).filter(Boolean);

  if (links.length === 0) {
    return {
      valid_links: [],
      invalid_links: [],
      pending_links: [],
      total_duration: 0,
      downloads: [],
    };
  }

  // PanCheck 同步返回检测结果，无需异步任务与轮询
  const result = await submitCheckRequest(links);
  if (!result) {
    throw createError({
      statusCode: 500,
      message: "检测失败或未配置 PanCheck 服务",
    });
  }

  const valid_links: string[] = [];
  const invalid_links: string[] = [];
  const pending_links: string[] = [];

  const resultWithDetails = downloads.map((d) => {
    // 以 link_results 中的详细信息为准判定状态
    const status = resolveLinkStatus(d.url, result);

    if (status === "valid") valid_links.push(d.url);
    else if (status === "invalid") invalid_links.push(d.url);
    else pending_links.push(d.url);

    return { ...d, status };
  });

  return {
    ...result,
    valid_links,
    invalid_links,
    pending_links,
    downloads: resultWithDetails,
  };
});
