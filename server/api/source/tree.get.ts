import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { parseShareUrl } from "./geturl";
import { QuarkUCClient, IShareFile } from "@netdisk-sdk/quarkuc-sdk";
import {
  BaiduClient,
  parseShareParam,
  IShareParam,
  IFile as IBaiduFile,
} from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import {
  getQuarkClient,
  getUCClient,
  getBaiduClient,
  getXunleiClient,
} from "#server/lib/pan";

const MAX_DEPTH = 20;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  let inputUrl = query.url as string | undefined;
  const id = query.id as string | undefined;

  if (!inputUrl && !id) {
    throw createError({ statusCode: 400, message: "缺少参数 url 或 id" });
  }

  let url = "";
  let source: {
    url: string;
    id: string;
    menu: string;
  } | null = null;

  if (id) {
    source = await prisma.source.findUnique({
      select: { id: true, url: true, menu: true },
      where: { id },
    });
    if (!source) {
      throw createError({ statusCode: 404, message: "资源不存在" });
    }
    url = source.url;
  } else if (inputUrl) {
    const decryptedUrl = await decryptUrl(inputUrl || "");
    if (decryptedUrl === null) {
      throw createError({ statusCode: 400, message: "链接解密失败" });
    }
    url = decryptedUrl;
  }

  const cacheKey = !id && inputUrl ? `tree:url:${inputUrl}` : null;
  if (cacheKey) {
    const cached = await getRedisCache<string>(cacheKey);
    if (cached !== null) {
      return { tree: cached, success: true };
    }
  }

  const parsed = parseShareUrl(url);

  let tree = "";
  if (parsed.type === "quark" || parsed.type === "uc") {
    tree = await buildQuarkUCTree(parsed.type, parsed.fid, parsed.passcode);
  } else if (parsed.type === "baidu") {
    tree = await buildBaiduTree(url);
  } else if (parsed.type === "xunlei") {
    tree = await buildXunleiTree(url);
  } else {
    return { message: "不支持的该网盘类型", success: false };
  }

  if (cacheKey) {
    await setRedisCache(cacheKey, tree, 24 * 60 * 60);
  }

  if (id && source && source.id && !source.menu && tree) {
    // update menu
    await prisma.source.update({
      where: { id: source.id },
      data: { menu: tree },
    });
  }

  return { tree, success: true };
});

async function buildQuarkUCTree(
  type: "quark" | "uc",
  pwdId: string,
  passcode: string,
): Promise<string> {
  const client =
    type === "quark" ? await getQuarkClient() : await getUCClient();

  let stoken: string;
  try {
    const tokenRes = await client.shareApi.token(pwdId, passcode || undefined);
    stoken = tokenRes.stoken;
  } catch (e: any) {
    throw createError({
      statusCode: 404,
      message: `获取分享令牌失败: ${e.message || "未知错误"}`,
    });
  }

  if (!stoken) {
    throw createError({ statusCode: 404, message: "获取分享令牌失败" });
  }

  const lines: string[] = [];
  await walkQuarkUC(client, pwdId, stoken, "0", "", 0, lines);
  return lines.join("\n");
}

async function walkQuarkUC(
  client: QuarkUCClient,
  pwdId: string,
  stoken: string,
  pdirFid: string,
  prefix: string,
  depth: number,
  lines: string[],
): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  const items: IShareFile[] = [];
  let page = 1;
  const pageSize = 200;

  while (page <= 5) {
    const res = await client.shareApi.detail(pwdId, stoken, {
      pdir_fid: pdirFid,
      _page: page,
      _size: pageSize,
      _sort: ["file_type:asc", "updated_at:desc"],
    });

    if (res.list && res.list.length > 0) {
      items.push(...res.list);
    }

    if (!res.list || res.list.length < pageSize) break;
    page++;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const isLast = i === items.length - 1;
    const connector = isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.file_name}`);

    if (item.file_type === 0) {
      const extension = isLast ? "  " : "│  ";
      await walkQuarkUC(
        client,
        pwdId,
        stoken,
        item.fid,
        prefix + extension,
        depth + 1,
        lines,
      );
    }
  }
}

async function buildBaiduTree(shareUrl: string): Promise<string> {
  const shareParam = parseShareParam(shareUrl);
  if (!shareParam) {
    throw createError({ statusCode: 404, message: "无效的百度分享链接" });
  }

  const client = await getBaiduClient();

  let rootInfo: any;
  try {
    rootInfo = await client.fsShareApi.wxlist({
      ...shareParam,
      dir: "/",
      page: 1,
      num: 100,
      root: 1,
    });
  } catch (err) {
    throw createError({ statusCode: 404, message: "分享已过期" });
  }

  const lines: string[] = [];
  await walkBaidu(client, shareParam, rootInfo.seckey || "", "/", "", 0, lines);
  return lines.join("\n");
}

async function walkBaidu(
  client: BaiduClient,
  shareParam: IShareParam,
  sekey: string,
  dir: string,
  prefix: string,
  depth: number,
  lines: string[],
): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  const res = await client.fsShareApi.wxlist({
    ...shareParam,
    dir,
    page: 1,
    num: 1000,
    root: dir === "/" ? 1 : 0,
    sekey,
  } as any);

  const items: IBaiduFile[] = res.list || [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const isLast = i === items.length - 1;
    const connector = isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.server_filename}`);

    if (item.isdir) {
      const extension = isLast ? "  " : "│  ";
      await walkBaidu(
        client,
        shareParam,
        res.seckey || sekey,
        item.path,
        prefix + extension,
        depth + 1,
        lines,
      );
    }
  }
}

async function buildXunleiTree(shareUrl: string): Promise<string> {
  const parsed = parseShareUrl(shareUrl);
  if (!parsed.fid) {
    throw createError({ statusCode: 404, message: "无效的迅雷分享链接" });
  }

  const client = await getXunleiClient();

  let detail: any;
  try {
    detail = await client.shareApi.getShare({
      shareId: parsed.fid,
      passCode: parsed.passcode,
      limit: 200,
    });
  } catch (e) {
    throw createError({ statusCode: 404, message: "分享已过期" });
  }

  if (detail.files.length === 0) {
    throw createError({ statusCode: 404, message: "分享内容为空" });
  }

  const lines: string[] = [];
  await walkXunlei(
    client,
    parsed.fid,
    detail.passCodeToken,
    detail.files,
    "",
    0,
    lines,
  );
  return lines.join("\n");
}

async function walkXunlei(
  client: XunleiClient,
  shareId: string,
  passCodeToken: string,
  items: { id: string; name: string; is_dir?: boolean }[],
  prefix: string,
  depth: number,
  lines: string[],
): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const isLast = i === items.length - 1;
    const connector = isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.name}`);

    if (item.is_dir) {
      const extension = isLast ? "  " : "│  ";
      const res = await client.shareApi.detail({
        shareId,
        passCodeToken,
        parentId: item.id,
        limit: 200,
      });

      if (res.files.length > 0) {
        await walkXunlei(
          client,
          shareId,
          passCodeToken,
          res.files.map((f) => ({ id: f.id, name: f.name, is_dir: f.is_dir })),
          prefix + extension,
          depth + 1,
          lines,
        );
      }
    }
  }
}
