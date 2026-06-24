import "dotenv/config";
import { prisma } from "#server/lib/prisma";

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

  const downloads = JSON.parse(music.downloads || "[]") as Array<{
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

  const pancheckApi = process.env.PANCHECK_API;
  if (!pancheckApi) {
    throw createError({
      statusCode: 500,
      message: "网盘检测 API 未配置",
    });
  }

  try {
    const response = await fetch(
      `${pancheckApi.replace(/\/$/, "")}/api/v1/links/check`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ links }),
      },
    );

    if (!response.ok) {
      throw new Error(`检测服务返回 ${response.status}`);
    }

    const result = await response.json();

    const resultWithDetails = downloads.map((d) => ({
      ...d,
      status: result.invalid_links?.includes(d.url)
        ? "invalid"
        : result.valid_links?.includes(d.url)
          ? "valid"
          : "pending",
    }));

    return {
      ...result,
      downloads: resultWithDetails,
    };
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `网盘检测失败: ${error.message || "未知错误"}`,
    });
  }
});
