import process from "node:process";
import { freemem, loadavg, totalmem } from "node:os";
import { runInNewContext } from "node:vm";
import {
  getHeapSpaceStatistics,
  getHeapStatistics,
  setFlagsFromString,
} from "node:v8";

/**
 * 运行时内存诊断（仅后台可用，挂在 /api/admin/system/memory）
 *
 * 目的：把「RSS 800MB」拆成可判读的分项，并定位是谁占住了堆。
 *
 * 判读方法：
 * - heapUsed 高 + old_space 的 available 接近 0
 *     → 是真实存活对象，不是 GC 惰性，必须找持有者（先看 shield 条目数）。
 * - heapUsed 低（< limit 的 25%）而 RSS 高
 *     → V8 没回收，属堆上限过宽导致的惰性 GC；限制 --max-old-space-size 即可回落。
 * - shield.total 很大（> 5 万）
 *     → 限流表无界增长，是本项目最可能的内存黑洞（memory driver 不删过期项）。
 * - rss 明显小于 heapTotal
 *     → 堆已 commit 但 OS 尚未全部驻留，属正常，不代表泄漏。
 *
 * 用法：
 *   GET /api/admin/system/memory          常规快照（含 shield 与 cache 统计）
 *   GET /api/admin/system/memory?gc=1     先强制 full GC 再取快照，返回 gcReclaimedMB
 *                                         （无需 --expose-gc 重启，运行时动态暴露）
 *   GET /api/admin/system/memory?cache=0  跳过 cache 统计
 *
 * 连续调用两次会返回两次之间的增量（deltaFromLastCall），
 * 用于判断是「稳态高位」还是「持续爬升」。
 */

const MB = 1024 * 1024;
const toMB = (bytes: number) => Math.round((bytes / MB) * 10) / 10;

/**
 * 上一次采样的快照。模块级变量，生命周期与进程一致，
 * 使连续两次请求能算出增长速率（端点本身无状态，这是最轻量的实现）。
 */
let lastSample: {
  at: number;
  rss: number;
  heapUsed: number;
  external: number;
} | null = null;

function memorySnapshot() {
  const m = process.memoryUsage();
  return {
    rss: toMB(m.rss),
    heapTotal: toMB(m.heapTotal),
    heapUsed: toMB(m.heapUsed),
    external: toMB(m.external),
    arrayBuffers: toMB(m.arrayBuffers),
  };
}

/**
 * 取得可用的 GC 函数。
 *
 * 优先用 --expose-gc 暴露的 global.gc；若没有（生产通常没有），
 * 就在运行时 setFlagsFromString('--expose-gc') 并在新的 vm 上下文中取 gc。
 * 这样无需重启进程即可验证「堆里那些对象到底可不可以回收」——
 * 这是区分「内存泄漏」与「V8 惰性 GC」的唯一定论手段。
 */
function resolveGc(): (() => void) | null {
  const existing = (globalThis as { gc?: () => void }).gc;
  if (typeof existing === "function") return existing;

  try {
    setFlagsFromString("--expose-gc");
    const fn = runInNewContext("gc");
    return typeof fn === "function" ? (fn as () => void) : null;
  } catch (err) {
    console.error(
      "[memory] 动态暴露 GC 失败:",
      (err as Error)?.message || err,
    );
    return null;
  }
}

/**
 * 统计限流表条目数。
 *
 * ⚠️ 不能用 storage.getKeys()：memory driver 下它会返回全量 key 数组，
 * 条目上百万时这个数组本身就是几十 MB 的瞬时分配，会加剧内存压力甚至触发 OOM。
 * 优先拿底层 Map 直接读 size / 遍历 key，零额外分配。
 */
function readShieldStats() {
  try {
    const storage = useStorage("shield");
    const raw = storage as unknown as { getInstance?: () => unknown };
    const instance =
      typeof raw.getInstance === "function" ? raw.getInstance() : null;

    if (instance instanceof Map) {
      let ipEntries = 0;
      let banEntries = 0;
      let other = 0;
      for (const key of instance.keys()) {
        const k = String(key);
        if (k.startsWith("ip:")) ipEntries++;
        else if (k.startsWith("ban:")) banEntries++;
        else other++;
      }
      return {
        total: instance.size,
        ipEntries,
        banEntries,
        other,
        source: "instance" as const,
      };
    }

    return null;
  } catch (err) {
    console.error(
      "[memory] 读取 shield 统计失败:",
      (err as Error)?.message || err,
    );
    return null;
  }
}

/**
 * 统计 Nitro handler 缓存。
 *
 * cache 挂载用的是 lru-cache（max 500 条 / 32MB），本身有硬上限，
 * 这里主要是确认它是否顶满，以及哪个 handler 条目最多。
 */
async function readCacheStats() {
  try {
    const storage = useStorage("cache");
    const keys = await storage.getKeys();

    // 按 handler 名分组：key 形如 nitro:handlers:api-music-search:<getKey>
    const byHandler: Record<string, number> = {};
    for (const key of keys) {
      const parts = String(key).split(":");
      const idx = parts.indexOf("handlers");
      const handler = idx >= 0 && parts[idx + 1] ? parts[idx + 1]! : "other";
      byHandler[handler] = (byHandler[handler] || 0) + 1;
    }

    // 抽样 10 条估算平均体积，避免逐条反序列化全部条目
    let sampledBytes = 0;
    let sampledCount = 0;
    for (const key of keys.slice(0, 10)) {
      const value = await storage.getItem(key);
      if (value === null || value === undefined) continue;
      sampledBytes += Buffer.byteLength(JSON.stringify(value), "utf8");
      sampledCount++;
    }
    const avgEntryBytes = sampledCount > 0 ? sampledBytes / sampledCount : 0;

    return {
      totalEntries: keys.length,
      byHandler,
      avgEntryBytes: Math.round(avgEntryBytes),
      estimatedTotalMB:
        Math.round(((avgEntryBytes * keys.length) / MB) * 10) / 10,
    };
  } catch (err) {
    console.error(
      "[memory] 读取 cache 统计失败:",
      (err as Error)?.message || err,
    );
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const gcRequested = query.gc === "1";
  const withCache = query.cache !== "0";

  const before = memorySnapshot();
  let gcRan = false;
  let gcReclaimedMB = 0;

  // global.gc 只在以 --expose-gc 启动时存在；没有则运行时动态暴露。
  // 这一步是区分「泄漏」与「GC 惰性」的关键：GC 后仍不降的才是真实占用。
  if (gcRequested) {
    const gc = resolveGc();
    if (gc) {
      gc();
      gcRan = true;
    }
  }

  const after = memorySnapshot();
  if (gcRan) {
    gcReclaimedMB = Math.round((before.heapUsed - after.heapUsed) * 10) / 10;
  }
  const current = gcRan ? after : before;

  const heapStats = getHeapStatistics();
  const limitMB = heapStats.heap_size_limit;
  const heapLimitMB = toMB(limitMB);

  const heapSpaces = getHeapSpaceStatistics().map((s) => ({
    name: s.space_name,
    size: toMB(s.space_size),
    used: toMB(s.space_used_size),
    available: toMB(s.space_available_size),
  }));

  const oldSpace = heapSpaces.find((s) => s.name === "old_space");
  const shield = readShieldStats();
  const cache = withCache ? await readCacheStats() : null;

  // 与上一次采样对比，得出增长速率
  const now = Date.now();
  let deltaFromLastCall: {
    elapsedSeconds: number;
    rssDeltaMB: number;
    heapUsedDeltaMB: number;
    perMinuteHeapMB: number;
  } | null = null;
  if (lastSample) {
    const elapsedSeconds = Math.round((now - lastSample.at) / 1000);
    const heapUsedDeltaMB =
      Math.round((current.heapUsed - lastSample.heapUsed) * 10) / 10;
    deltaFromLastCall = {
      elapsedSeconds,
      rssDeltaMB: Math.round((current.rss - lastSample.rss) * 10) / 10,
      heapUsedDeltaMB,
      perMinuteHeapMB:
        elapsedSeconds > 0
          ? Math.round((heapUsedDeltaMB / (elapsedSeconds / 60)) * 10) / 10
          : 0,
    };
  }
  lastSample = {
    at: now,
    rss: current.rss,
    heapUsed: current.heapUsed,
    external: current.external,
  };

  // rss < heapTotal 时说明堆已 commit 但 OS 尚未全量驻留，此时算堆外占用没有意义
  const nativeMB =
    current.rss > current.heapTotal + current.external
      ? Math.round((current.rss - current.heapTotal - current.external) * 10) / 10
      : null;

  const usageRatio =
    limitMB > 0
      ? Math.round((heapStats.used_heap_size / limitMB) * 1000) / 1000
      : 0;

  const verdict: string[] = [];
  const oldSpaceFull = oldSpace
    ? oldSpace.available < oldSpace.size * 0.1
    : false;

  if (oldSpaceFull && current.heapUsed > 300 && !gcRan) {
    verdict.push(
      `old_space 已用 ${oldSpace?.used}MB / ${oldSpace?.size}MB（可用仅 ${oldSpace?.available}MB）：需带 ?gc=1 强制回收一次，才能判断是存活对象占满还是 V8 未回收。`,
    );
  }
  if (gcRan && before.heapUsed > 200) {
    const ratio = gcReclaimedMB / before.heapUsed;
    if (ratio > 0.3) {
      verdict.push(
        `强制 GC 回收了 ${gcReclaimedMB}MB（占 ${Math.round(ratio * 100)}%）：这部分是可回收垃圾，不是泄漏。根因是堆上限 ${heapLimitMB}MB 过宽导致 GC 惰性，限制 --max-old-space-size 即可压制。`,
      );
    } else {
      verdict.push(
        `强制 GC 仅回收 ${gcReclaimedMB}MB，剩余 ${current.heapUsed}MB 为真实存活对象：存在真实泄漏或超大有界缓存，需抓堆快照定位持有者。`,
      );
    }
  }
  if (usageRatio < 0.25 && current.rss > 400 && !oldSpaceFull) {
    verdict.push(
      "堆使用率低于 25% 而 RSS 偏高：倾向惰性 GC，建议设置 --max-old-space-size。",
    );
  }
  if (shield && shield.total > 50_000) {
    verdict.push(
      `限流表已积累 ${shield.total} 条（ip: ${shield.ipEntries} / ban: ${shield.banEntries}），memory driver 不清理过期项且清理任务未调度，属无界增长，高度可疑。`,
    );
  } else if (shield && shield.total > 10_000) {
    verdict.push(
      `限流表 ${shield.total} 条，已偏多，建议补 shield:cleanIpData 调度并收紧 trustXForwardedFor。`,
    );
  } else if (shield) {
    verdict.push(`限流表 ${shield.total} 条，规模正常，可排除该因素。`);
  }
  if (cache && cache.totalEntries >= 480) {
    verdict.push(
      `handler 缓存 ${cache.totalEntries} 条已接近 lru-cache 的 500 上限（约 ${cache.estimatedTotalMB}MB），属正常封顶行为。`,
    );
  }
  if (nativeMB !== null && nativeMB > 300) {
    verdict.push(
      `堆外占用 ${nativeMB}MB 偏高：重点查 Prisma/PG 连接池规模与 native 模块。`,
    );
  }
  if (deltaFromLastCall && deltaFromLastCall.perMinuteHeapMB > 2) {
    verdict.push(
      `距上次调用堆增长 ${deltaFromLastCall.perMinuteHeapMB}MB/分钟，存在持续增长，需持续采样确认。`,
    );
  }
  if (verdict.length === 0) {
    verdict.push("各项指标均在合理区间，暂无明显异常。");
  }

  return {
    ok: true,
    collectedAt: new Date().toISOString(),
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV,
      execArgv: process.execArgv,
      nodeOptions: process.env.NODE_OPTIONS || "(未设置)",
      gcExposed: typeof (globalThis as { gc?: () => void }).gc === "function",
    },
    memory: {
      ...current,
      native: nativeMB,
      nativeNote:
        nativeMB === null
          ? "RSS 小于 heapTotal，堆已 commit 但未全部驻留，堆外占用无法据此推算"
          : undefined,
      gcRequested,
      gcRan,
      gcReclaimedMB,
      note:
        gcRequested && !gcRan
          ? "已请求 GC 但无法获取 gc 函数（setFlagsFromString 在该 Node 版本不可用），数值未包含强制回收效果"
          : undefined,
    },
    heap: {
      limit: heapLimitMB,
      total: toMB(heapStats.total_heap_size),
      used: toMB(heapStats.used_heap_size),
      available: toMB(heapStats.total_available_size),
      usageRatio,
      malloced: toMB(heapStats.malloced_memory),
      peakMalloced: toMB(heapStats.peak_malloced_memory),
      spaces: heapSpaces,
    },
    host: {
      totalMem: Math.round(totalmem() / MB),
      freeMem: Math.round(freemem() / MB),
      loadAvg: process.platform === "win32" ? null : loadavg(),
    },
    shield,
    cache,
    deltaFromLastCall,
    verdict,
  };
});
