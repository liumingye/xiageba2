// Rate Limit 中间件：滑动窗口 + 按路由独立配置
// 配置格式：{ [routePrefix]: { windowSeconds, maxRequests } }
// - routePrefix 按前缀匹配（请求 URL 以该字符串开头即命中）
// - 多条规则都匹配时，取"最严格的"那条（更早触发 429）

import type { H3Event } from "h3";

interface RateLimitRule {
  /** 路径前缀，如 /api/music/search */
  prefix: string;
  /** 窗口大小（秒） */
  windowSeconds: number;
  /** 窗口内最多请求次数 */
  maxRequests: number;
}

// 在此配置：path, windowSeconds, maxRequests
const RULES: RateLimitRule[] = [
  { prefix: "/api/music/search", windowSeconds: 60, maxRequests: 30 },
  { prefix: "/api/music/recent", windowSeconds: 60, maxRequests: 15 },
  { prefix: "/api/music/feedback", windowSeconds: 300, maxRequests: 10 },
  { prefix: "/api/admin/login", windowSeconds: 60, maxRequests: 5 },
  { prefix: "/music/", windowSeconds: 300, maxRequests: 120 },
  { prefix: "/api/source/geturl", windowSeconds: 30, maxRequests: 10 },
];

// 数据结构：Map<routeKey, Map<ip, number[]>>
// 每个路由独立维护自己的时间戳窗口，互不干扰
const counters = new Map<string, Map<string, number[]>>();

// 每 10 秒清理一次过期条目
setInterval(() => {
  const now = Date.now();
  for (const [routeKey, ipMap] of counters) {
    const [_, windowSeconds] = routeKey.split(":").map(Number);
    if (!windowSeconds) continue;

    const cutoff = now - windowSeconds * 1000;
    for (const [ip, timestamps] of ipMap) {
      const filtered = timestamps.filter((ts) => ts > cutoff);
      if (filtered.length === 0) {
        ipMap.delete(ip);
      } else if (filtered.length !== timestamps.length) {
        ipMap.set(ip, filtered);
      }
    }
    if (ipMap.size === 0) {
      counters.delete(routeKey);
    }
  }
}, 10 * 1000).unref?.();

function getClientIp(event: H3Event): string {
  const headers = event.node?.req?.headers || (event as any).headers || {};
  const fwd = headers["x-forwarded-for"] as string | undefined;
  if (fwd) {
    const ips = fwd.split(",")[0];
    if (ips) {
      return ips.trim();
    }
  }
  const realIp = headers["x-real-ip"] as string | undefined;
  if (realIp) return realIp.trim();
  return (event.node?.req?.socket?.remoteAddress as string) || "unknown";
}

function matchRules(url: string): RateLimitRule | null {
  // 匹配多条规则时，取"最早触发 429"的那条
  // 简单计算：maxRequests / windowSeconds 比值最小的最严格；
  // 若比值相同，取 maxRequests 更小的
  let strictest: RateLimitRule | null = null;
  let strictestRatio = Infinity;

  for (const rule of RULES) {
    if (!url.startsWith(rule.prefix)) continue;
    const ratio = rule.maxRequests / rule.windowSeconds;
    if (
      ratio < strictestRatio ||
      (ratio === strictestRatio &&
        strictest &&
        rule.maxRequests < strictest.maxRequests)
    ) {
      strictest = rule;
      strictestRatio = ratio;
    }
  }
  return strictest;
}

export default defineEventHandler((event) => {
  const url = (event as any).path || event.node?.req?.url || "";
  const rule = matchRules(url);
  if (!rule) return;

  const ip = getClientIp(event);
  const now = Date.now();
  const cutoff = now - rule.windowSeconds * 1000;
  const routeKey = `${rule.prefix}:${rule.windowSeconds}`;

  if (!counters.has(routeKey)) {
    counters.set(routeKey, new Map<string, number[]>());
  }
  const ipMap = counters.get(routeKey)!;

  const prevTimestamps = ipMap.get(ip) || [];
  const timestamps = prevTimestamps.filter((ts) => ts > cutoff);

  if (timestamps.length >= rule.maxRequests) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rule.windowSeconds * 1000 - (now - timestamps[0])) / 1000),
    );

    throw createError({
      statusCode: 429,
      statusMessage: "Too Many Requests",
      message: "请求过于频繁，请稍后再试",
      data: {
        retryAfter,
      },
    });
  }

  timestamps.push(now);
  ipMap.set(ip, timestamps);
});
