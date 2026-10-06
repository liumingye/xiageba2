import { OpenAI } from "openai";

/**
 * AI 大模型客户端工厂（单例复用）
 *
 * 背景：此前 /api/ai-search 在每个请求里 `new OpenAI({...})`：
 * 1. 每请求新建 Agent/连接池等内部资源，高并发下白白制造大量短命对象与 TCP 连接；
 * 2. 未显式传 timeout → 落到 SDK 默认 600_000ms（等于没有超时），
 *    上游挂起时排队机槽位被永久占用；
 * 3. 未显式传 maxRetries → 默认 2 次重试，叠加超时后最坏耗时是单次的 3 倍。
 *
 * 本模块按「baseURL + apiKey」签名缓存客户端：
 * - 配置不变 → 复用同一实例（共享底层连接池，减少握手与资源开销）
 * - 配置变更（后台改了 key/地址）→ 自动换新实例，不需要重启进程
 * - 缓存条数设上限，防止后台被反复改成不同配置时无限增长
 */

export interface AiClientConfig {
  baseURL: string;
  apiKey: string;
}

/** 单次请求超时（毫秒）。SDK 默认 600_000，等于没设。 */
export const AI_REQUEST_TIMEOUT_MS = toPositiveInt(
  process.env.AI_SEARCH_TIMEOUT_MS,
  10_000,
);

/** 缓存的客户端数量上限，超出后淘汰最早的一个（Map 保持插入序）。 */
const MAX_CACHED_CLIENTS = 3;

const clientCache = new Map<string, OpenAI>();

const signatureOf = (config: AiClientConfig): string =>
  `${config.baseURL}|${config.apiKey}`;

/**
 * 获取（或创建）可复用的 OpenAI 客户端。
 * 同 baseURL + apiKey 永远返回同一个实例。
 */
export function getAiChatClient(config: AiClientConfig): OpenAI {
  const signature = signatureOf(config);
  const cached = clientCache.get(signature);
  if (cached) return cached;

  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: AI_REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });

  if (clientCache.size >= MAX_CACHED_CLIENTS) {
    const oldest = clientCache.keys().next().value;
    if (oldest !== undefined) clientCache.delete(oldest);
  }
  clientCache.set(signature, client);

  return client;
}

/** 仅测试用：清空客户端缓存。 */
export const resetAiClientCacheForTest = (): void => {
  clientCache.clear();
};

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
