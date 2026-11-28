import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { clearTreeSymbols, truncateString } from "#server/utils/source";
import { buildTokens } from "#server/utils/jieba";
import { parseShareUrl } from "#server/lib/pan/share-url";
import { getAdapterByType } from "#server/lib/pan/adapters";
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
    const adapter = getAdapterByType(parsed.type);
    if (!adapter) {
      throw createError({ statusCode: 400, message: "不支持的该网盘类型" });
    }

    const account = await requireAccount(parsed.type);
    const client = await getClientByAccount(account);
    const generatedTree = await adapter.buildTree(client, parsed);

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

async function requireAccount(type: string) {
  const account = await getRandomAccountByType(type);
  if (!account) {
    throw createError({ statusCode: 500, message: "没有可用的网盘账号" });
  }
  return account;
}
