import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { clearTreeSymbols, truncateString } from "#server/utils/source";
import { buildTokens } from "#server/utils/jieba";
import { parseShareUrl } from "./geturl";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import type { IShareFile } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient, parseShareParam } from "@netdisk-sdk/baidu-sdk";
import type { IShareParam, IFile as IBaiduFile } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { GuangyaClient } from "@netdisk-sdk/guangya-sdk";
import type { IGuangyaFile } from "@netdisk-sdk/guangya-sdk";
import { C139Client } from "@netdisk-sdk/c139-sdk";
import { getClientByAccount } from "#server/lib/pan-instance";
import { getRandomAccountByType } from "#server/lib/accountCache";
import { TREE_MAX_LINE } from "#server/lib/const";
import { automaton_ad_filter, SimpleAC } from "#server/lib/simpleAC";

const MAX_DEPTH = 5;

// 🔒 内存进程锁：阻断高并发的核心大闸
// 确保同一时间，同一个资源文件树，全国只有一个 Worker 在调用网盘 SDK 跑递归，其余并发请求排队共享结果
const treeInflightRequests = new Map<string, Promise<string>>();

const filterAdResults = <T>(
  items: T[],
  fileNameKey: keyof T,
  automaton: SimpleAC | null,
): T[] => {
  if (!automaton) return items;
  return items.filter((item) => {
    let haystack = item[fileNameKey] || "";
    if (typeof haystack !== "string") return false;
    return !automaton.hasMatch(haystack);
  });
};

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  let inputUrl = query.url as string | undefined;
  const id = query.id as string | undefined;

  if (!inputUrl && !id) {
    throw createError({ statusCode: 400, message: "缺少参数 url 或 id" });
  }

  if (id && inputUrl) {
    throw createError({ statusCode: 400, message: "id 和 url 不能同时存在" });
  }

  let url = "";
  let sourceId = id || "";
  let sourceTitle = "";
  let sourceDescription = "";

  // 解密 url
  if (inputUrl) {
    const decryptedUrl = await decryptUrl(inputUrl || "");
    if (decryptedUrl === null) {
      throw createError({ statusCode: 400, message: "链接解密失败" });
    }
    url = decryptedUrl;
  }

  // ⚡ 优化：不管通过 id 还是 url，都映射生成全局唯一的 cacheKey 确保全渠道覆盖
  const cacheKey = id
    ? `tree:id:${id}`
    : `tree:url:${Buffer.from(url).toString("base64").substring(0, 40)}`;

  // 🚀 一级防御：读取分布式高速缓存 Redis
  const cached = await getRedisCache<string>(cacheKey);
  if (cached !== null) {
    return { tree: cached, success: true, cache: "redis" };
  }

  // 🔒 二级防御：互斥单飞锁，阻断多层网盘递归请求对连接池的瞬间榨干
  if (treeInflightRequests.has(cacheKey)) {
    const activeTree = await treeInflightRequests.get(cacheKey);
    return { tree: activeTree, success: true, cache: "inflight" };
  }

  if (id) {
    const source = await prisma.source.findUnique({
      select: {
        id: true,
        url: true,
        title: true,
        description: true,
        menu: true,
        status: true,
      },
      where: { id },
    });
    if (!source || source.status === 0) {
      throw createError({ statusCode: 404, message: "资源不存在或已被删除" });
    }
    url = source.url;
    sourceTitle = source.title || "";
    sourceDescription = source.description || "";
    // 目录文件数太多，直接返回数据库内容，不获取新目录了
    if (source.menu) {
      const lineNum = source.menu.split(/\r?\n/).length;
      if (lineNum >= TREE_MAX_LINE) {
        return {
          cache: "db",
          tree: source.menu,
          success: true,
        };
      }
    }
  }

  // 构建核心的文件树递归生成任务链
  const generateTreePromise = (async () => {
    const parsed = parseShareUrl(url);
    let generatedTree = "";

    if (parsed.type === "quark" || parsed.type === "uc") {
      generatedTree = await buildQuarkUCTree(
        parsed.type,
        parsed.fid,
        parsed.passcode,
      );
    } else if (parsed.type === "baidu") {
      generatedTree = await buildBaiduTree(url);
    } else if (parsed.type === "xunlei") {
      generatedTree = await buildXunleiTree(url);
    } else if (parsed.type === "guangya") {
      generatedTree = await buildGuangyaTree(parsed.fid, parsed.passcode);
    } else if (parsed.type === "c139") {
      generatedTree = await buildC139Tree(parsed.fid, parsed.passcode);
    } else {
      throw createError({ statusCode: 400, message: "不支持的该网盘类型" });
    }

    const truncateTree = truncateString(
      generatedTree,
      TREE_MAX_LINE,
      "\n(文件过多，已截断显示)",
    );

    // 写入 Redis 缓存（保存24小时）
    await setRedisCache(cacheKey, truncateTree, 24 * 60 * 60);

    // 异步写库：改用非阻塞式后台运行，不再挂起当前的 HTTP 响应时间
    if (sourceId && truncateTree) {
      const tokens = buildTokens(
        sourceTitle,
        sourceDescription,
        clearTreeSymbols(truncateTree),
      );

      prisma.$executeRaw`UPDATE "Source" SET "menu" = ${truncateTree}, "searchVector" = to_tsvector('simple', ${tokens}) WHERE id = ${sourceId}`.catch(
        (err) => console.error("更新菜单树失败:", err),
      );
    }

    return truncateTree;
  })();

  // 登记锁
  treeInflightRequests.set(cacheKey, generateTreePromise);

  try {
    const tree = await generateTreePromise;
    return {
      tree,
      success: true,
    };
  } finally {
    // 🔒 办完手续，释放锁
    treeInflightRequests.delete(cacheKey);
  }
});

async function buildQuarkUCTree(
  type: "quark" | "uc",
  pwdId: string,
  passcode: string,
): Promise<string> {
  const account = await getRandomAccountByType(type);
  if (!account) {
    throw createError({ statusCode: 500, message: "没有可用的网盘账号" });
  }
  const client = (await getClientByAccount(account)) as QuarkUCClient;

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
  // 夸克api有限制pageSize最大100
  const pageSize = 100;
  const maxPages = 2;

  while (page <= maxPages) {
    const res = await client.shareApi.detail(pwdId, stoken, {
      pdir_fid: pdirFid,
      _page: page,
      _size: pageSize,
      _sort: ["file_type:asc", "file_name:asc"],
    });

    if (res.list && res.list.length > 0) {
      const filteredItems = filterAdResults(
        res.list,
        "file_name",
        automaton_ad_filter,
      );
      items.push(...filteredItems);
    }

    if (!res.list || res.list.length < pageSize) break;
    page++;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const isLast = i === items.length - 1;
    const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.file_name}`);

    if (lines.length >= TREE_MAX_LINE + 5) {
      break;
    }

    if (item.file_type === 0) {
      const extension = depth === 0 ? "" : isLast ? "  " : "│  ";
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

  const account = await getRandomAccountByType("baidu");
  if (!account) {
    throw createError({ statusCode: 500, message: "没有可用的网盘账号" });
  }
  const client = (await getClientByAccount(account)) as BaiduClient;

  let rootInfo: any;
  try {
    rootInfo = await client.fsShareApi.wxlist({
      ...shareParam,
      dir: "/",
      page: 1,
      num: 200,
      root: 1,
    });
  } catch (err) {
    console.error("获取分享目录失败:", err);
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
    num: 200,
    root: dir === "/" ? 1 : 0,
    sekey,
    order: "name",
    desc: 0,
  } as any);

  const fileList: IBaiduFile[] = res.list || [];
  fileList.sort((a, b) => {
    // 目录排在前面
    if (a.isdir && !b.isdir) return -1;
    if (!a.isdir && b.isdir) return 1;
    // 同一类型按文件名排序
    return a.server_filename.localeCompare(b.server_filename, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  const items = filterAdResults(
    fileList,
    "server_filename",
    automaton_ad_filter,
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const isLast = i === items.length - 1;
    const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.server_filename}`);

    if (lines.length >= TREE_MAX_LINE + 5) {
      break;
    }

    if (item.isdir) {
      const extension = depth === 0 ? "" : isLast ? "  " : "│  ";
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

  const account = await getRandomAccountByType("xunlei");
  if (!account) {
    throw createError({ statusCode: 500, message: "没有可用的网盘账号" });
  }
  const client = (await getClientByAccount(account)) as XunleiClient;

  let detail: any;
  try {
    detail = await client.shareApi.getShare({
      shareId: parsed.fid,
      passCode: parsed.passcode,
      limit: 200,
    });
  } catch (e) {
    console.error("获取分享详情失败:", e);
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

  items = filterAdResults(items, "name", automaton_ad_filter);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const isLast = i === items.length - 1;
    const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.name}`);

    if (lines.length >= TREE_MAX_LINE + 5) {
      break;
    }

    if (item.is_dir) {
      const extension = depth === 0 ? "" : isLast ? "  " : "│  ";
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

async function buildGuangyaTree(
  shareId: string,
  passcode: string,
): Promise<string> {
  const account = await getRandomAccountByType("guangya");
  if (!account) {
    throw createError({ statusCode: 500, message: "没有可用的网盘账号" });
  }
  const client = (await getClientByAccount(account)) as GuangyaClient;

  // 获取分享访问令牌
  let accessToken = "";
  try {
    const tokenRes = await client.shareApi.shareAccessToken(shareId, passcode);
    accessToken = tokenRes.accessToken;
  } catch (e: any) {
    throw createError({
      statusCode: 404,
      message: `获取分享令牌失败: ${e.message || "未知错误"}`,
    });
  }

  if (!accessToken) {
    throw createError({ statusCode: 404, message: "获取分享令牌失败" });
  }

  const lines: string[] = [];
  await walkGuangya(client, accessToken, "", "", 0, lines);
  return lines.join("\n");
}

async function walkGuangya(
  client: GuangyaClient,
  accessToken: string,
  parentId: string,
  prefix: string,
  depth: number,
  lines: string[],
): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  const items: IGuangyaFile[] = [];
  let page = 1;
  const pageSize = 100;
  const maxPages = 2;

  while (page <= maxPages) {
    const res = await client.shareApi.shareFilesList({
      accessToken,
      parentId,
      page,
      pageSize,
    });

    if (res.list && res.list.length > 0) {
      items.push(...res.list);
    }

    if (!res.list || res.list.length < pageSize) break;
    page++;
  }

  // 目录排前面，同类型按文件名排序
  items.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.fileName.localeCompare(b.fileName, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  const filtered = filterAdResults(items, "fileName", automaton_ad_filter);

  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i];
    if (!item) continue;
    const isLast = i === filtered.length - 1;
    const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.fileName}`);

    if (lines.length >= TREE_MAX_LINE + 5) {
      break;
    }

    if (item.isDir) {
      const extension = depth === 0 ? "" : isLast ? "  " : "│  ";
      await walkGuangya(
        client,
        accessToken,
        item.fid,
        prefix + extension,
        depth + 1,
        lines,
      );
    }
  }
}

async function buildC139Tree(
  linkId: string,
  passcode: string,
): Promise<string> {
  const account = await getRandomAccountByType("c139");
  if (!account) {
    throw createError({ statusCode: 500, message: "没有可用的网盘账号" });
  }
  const client = (await getClientByAccount(account)) as C139Client;

  const lines: string[] = [];
  await walkC139(client, linkId, passcode, "root", "", 0, lines);
  return lines.join("\n");
}

async function walkC139(
  client: C139Client,
  linkId: string,
  passcode: string,
  pcaId: string,
  prefix: string,
  depth: number,
  lines: string[],
): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  let res;
  try {
    res = await client.shareApi.getShareFiles({
      linkId,
      pcaId,
      passwd: passcode,
    });
  } catch (e: any) {
    throw createError({
      statusCode: 404,
      message: `获取分享目录失败: ${e.message || "未知错误"}`,
    });
  }

  const items = res.list || [];
  // 目录排前面，同类型按文件名排序
  items.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.fileName.localeCompare(b.fileName, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  const filtered = filterAdResults(items, "fileName", automaton_ad_filter);

  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i];
    if (!item) continue;
    const isLast = i === filtered.length - 1;
    const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.fileName}`);

    if (lines.length >= TREE_MAX_LINE + 5) {
      break;
    }

    if (item.isDir) {
      const extension = depth === 0 ? "" : isLast ? "  " : "│  ";
      await walkC139(
        client,
        linkId,
        passcode,
        item.fid,
        prefix + extension,
        depth + 1,
        lines,
      );
    }
  }
}
