import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { clearTreeSymbols, truncateString } from "#server/utils/source";
import { buildTokens } from "#server/utils/jieba";
import { parseShareUrl } from "#server/lib/pan/share-url";
import { renderTree, sortEntries } from "#server/lib/pan/tree";
import { filterAdFiles } from "#server/lib/pan/ad-filter";
import type { PanFile, ParsedShare } from "#server/lib/pan/types";
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
import { assertBotDefense } from "#server/utils/bot-defense";

// 🔒 内存进程锁：阻断高并发的核心大闸
// 确保同一时间，同一个资源文件树，全国只有一个 Worker 在调用网盘 SDK 跑递归，其余并发请求排队共享结果
const treeInflightRequests = new Map<string, Promise<string>>();

export default defineEventHandler(async (event) => {
  // BOT 防御闸门：未启用时直接放行，启用后需携带有效通行令牌
  await assertBotDefense(event, "/api/source/tree");

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

  // 🔒 三级防御：写入前的二次检查（双检）
  //
  // 上面的 has() 与本处的 set() 之间隔着 findUnique、菜单行数判断等 await，
  // 每个 await 都会让出事件循环，并发请求因此会「全部通过上面的检查」，
  // 再依次各自上锁 —— 锁形同虚设，同一目录会被并发拉取 N 次，瞬间榨干网盘连接池。
  //
  // 本检查到 set() 之间不存在 await（下方异步函数调用是同步返回 Promise），
  // 靠 JS 单线程的同步执行保证「检查 + 写入」的原子性。
  const recheck = treeInflightRequests.get(cacheKey);
  if (recheck) {
    const activeTree = await recheck;
    return { tree: activeTree, success: true, cache: "inflight" };
  }

  // 构建核心的文件树递归生成任务链
  const generateTreePromise = (async () => {
    const parsed = parseShareUrl(url);
    const builder = TREE_BUILDERS[parsed.type];
    if (!builder) {
      throw createError({ statusCode: 400, message: "不支持的该网盘类型" });
    }

    const generatedTree = await builder(parsed);

    const truncateTree = truncateString(
      generatedTree,
      TREE_MAX_LINE,
      "\n(文件过多，已截断显示)",
    );

    // 写入 Redis 缓存（保存6小时）
    await setRedisCache(cacheKey, truncateTree, 6 * 60 * 60);

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

/**
 * 网盘类型 → 树构建器。
 * 新增网盘只需在此登记一行，handler 与渲染骨架都不用动。
 */
const TREE_BUILDERS: Record<
  string,
  (parsed: ParsedShare) => Promise<string>
> = {
  quark: (p) => buildQuarkUCTree("quark", p.fid, p.passcode),
  uc: (p) => buildQuarkUCTree("uc", p.fid, p.passcode),
  baidu: (p) => buildBaiduTree(p.url),
  xunlei: (p) => buildXunleiTree(p.fid, p.passcode),
  guangya: (p) => buildGuangyaTree(p.fid, p.passcode),
  c139: (p) => buildC139Tree(p.fid, p.passcode),
};

async function requireAccount(type: string) {
  const account = await getRandomAccountByType(type);
  if (!account) {
    throw createError({ statusCode: 500, message: "没有可用的网盘账号" });
  }
  return account;
}

/**
 * 百度的 isdir 在不同接口/不同版本下出现过数字 1 与字符串 "1" 两种形态。
 * 这里按「是否为目录」做宽容判定，避免严格等于 1 把子目录误判成文件导致不展开。
 */
function toIsDir(value: unknown): boolean {
  return value === 1 || value === "1" || value === true;
}

async function buildQuarkUCTree(
  type: "quark" | "uc",
  pwdId: string,
  passcode: string,
): Promise<string> {
  const account = await requireAccount(type);
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

  return renderTree({
    rootId: "0",
    listChildren: async (parentId) => {
      const items: IShareFile[] = [];
      // 夸克api有限制pageSize最大100
      const pageSize = 100;
      const maxPages = 2;
      let page = 1;

      while (page <= maxPages) {
        const res = await client.shareApi.detail(pwdId, stoken, {
          pdir_fid: parentId,
          _page: page,
          _size: pageSize,
          _sort: ["file_type:asc", "file_name:asc"],
        });

        if (res.list && res.list.length > 0) {
          items.push(...res.list);
        }

        if (!res.list || res.list.length < pageSize) break;
        page++;
      }

      const files: PanFile[] = items.map((item) => ({
        id: item.fid,
        name: item.file_name,
        isDir: item.file_type === 0,
      }));
      return filterAdFiles(files);
    },
  });
}

async function buildBaiduTree(shareUrl: string): Promise<string> {
  const shareParam = parseShareParam(shareUrl);
  if (!shareParam) {
    throw createError({ statusCode: 404, message: "无效的百度分享链接" });
  }

  const account = await requireAccount("baidu");
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

  // 百度的 seckey 是逐层下发的：子目录必须带父层响应里的 seckey。
  // 深度优先遍历保证父层一定先于子层被访问，用路径 → seckey 的映射即可还原。
  const sekeyByDir = new Map<string, string>([
    ["/", rootInfo.seckey || ""],
  ]);

  return renderTree({
    rootId: "/",
    listChildren: async (dir) => {
      const res = await client.fsShareApi.wxlist({
        ...shareParam,
        dir,
        page: 1,
        num: 200,
        root: dir === "/" ? 1 : 0,
        sekey: sekeyByDir.get(dir) || "",
        order: "name",
        desc: 0,
      } as any);

      const fileList: IBaiduFile[] = res.list || [];
      const currentSekey = res.seckey || sekeyByDir.get(dir) || "";
      for (const file of fileList) {
        if (toIsDir(file.isdir)) sekeyByDir.set(file.path, currentSekey);
      }

      const files: PanFile[] = fileList.map((file) => ({
        id: file.path,
        name: file.server_filename,
        isDir: toIsDir(file.isdir),
      }));
      return filterAdFiles(sortEntries(files));
    },
  });
}

async function buildXunleiTree(
  shareId: string,
  passcode: string,
): Promise<string> {
  if (!shareId) {
    throw createError({ statusCode: 404, message: "无效的迅雷分享链接" });
  }

  const account = await requireAccount("xunlei");
  const client = (await getClientByAccount(account)) as XunleiClient;

  let detail: any;
  try {
    detail = await client.shareApi.getShare({
      shareId,
      passCode: passcode,
      limit: 200,
    });
  } catch (e) {
    console.error("获取分享详情失败:", e);
    throw createError({ statusCode: 404, message: "分享已过期" });
  }

  if (detail.files.length === 0) {
    throw createError({ statusCode: 404, message: "分享内容为空" });
  }

  // 迅雷根目录的文件在 getShare 响应里直接给出，无需再请求
  const ROOT_ID = "";

  return renderTree({
    rootId: ROOT_ID,
    listChildren: async (parentId) => {
      const raw =
        parentId === ROOT_ID
          ? detail.files
          : (
              await client.shareApi.detail({
                shareId,
                passCodeToken: detail.passCodeToken,
                parentId,
                limit: 200,
              })
            ).files;

      const files: PanFile[] = raw.map(
        (f: { id: string; name: string; is_dir?: boolean }) => ({
          id: f.id,
          name: f.name,
          isDir: !!f.is_dir,
        }),
      );
      return filterAdFiles(files);
    },
  });
}

async function buildGuangyaTree(
  shareId: string,
  passcode: string,
): Promise<string> {
  const account = await requireAccount("guangya");
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

  return renderTree({
    rootId: "",
    listChildren: async (parentId) => {
      const items: IGuangyaFile[] = [];
      const pageSize = 100;
      const maxPages = 2;
      let page = 1;

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

      const files: PanFile[] = items.map((item) => ({
        id: item.fid,
        name: item.fileName,
        isDir: item.isDir,
      }));
      return filterAdFiles(sortEntries(files));
    },
  });
}

async function buildC139Tree(
  linkId: string,
  passcode: string,
): Promise<string> {
  const account = await requireAccount("c139");
  const client = (await getClientByAccount(account)) as C139Client;

  return renderTree({
    rootId: "root",
    listChildren: async (pcaId) => {
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

      const files: PanFile[] = (res.list || []).map((item) => ({
        id: item.fid,
        name: item.fileName,
        isDir: item.isDir,
      }));
      return filterAdFiles(sortEntries(files));
    },
  });
}
