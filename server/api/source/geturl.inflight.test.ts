import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/source/geturl 并发单飞锁（inflightRequests）测试
 *
 * 背景：geturl 在 Redis 缓存未命中时，会把 transferShareUrl 的 Promise 放进
 * 模块级 Map（inflightRequests）做并发去重，避免同一分享链接被并发转存多次
 * —— 每次转存都会占用网盘账号配额，重复转存既浪费配额也可能触发风控。
 *
 * 本测试锁定的行为：
 * 1. 同一 cacheKey 并发 N 次，转存只执行 1 次，其余复用同一个 Promise
 * 2. 不同 cacheKey 互不阻塞（锁的粒度是链接，不是全局）
 * 3. 正常完成后锁被释放，后续请求会重新执行
 * 4. 转存抛错后锁依然被释放（finally 生效），不会永久占位导致该链接彻底不可用
 * 5. Redis 一级缓存命中时直接返回，不会触碰锁与转存逻辑
 *
 * 挂起点设计：transferShareUrl 内部 `await getRandomAccountByType(type)` 是最早的
 * 外部依赖调用，把它换成受控 Promise 即可让转存精确停在锁内，无需 mock 整套网盘 SDK。
 * 同时它的调用次数就是「转存实际执行次数」的计数依据。
 */

const h = vi.hoisted(() => ({
  /** readBody 轮询下标，用于给并发请求分配不同 body */
  bodyCursor: 0,
  bodies: [] as any[],
  /** 转存实际执行次数（= getRandomAccountByType 调用次数） */
  accountCalls: 0,
  /** 受控的取账号实现，由各用例注入 */
  accountImpl: null as null | (() => Promise<any>),
  /** Redis 一级缓存返回值 */
  redisCacheValue: null as string | null,
  /** getRedisCache 收到的 key，用于核对 cacheKey 是否一致 */
  redisKeys: [] as string[],
}));

vi.mock("#server/lib/accountCache", () => ({
  getRandomAccountByType: () => {
    h.accountCalls++;
    if (!h.accountImpl) throw new Error("用例未设置 accountImpl");
    return h.accountImpl();
  },
}));

vi.mock("#server/lib/redis", () => ({
  getRedisCache: async (key: string) => {
    h.redisKeys.push(key);
    return h.redisCacheValue;
  },
  setRedisCache: async () => {},
}));

vi.mock("#server/lib/crypto", () => ({
  decryptUrl: async (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    source: {
      findUnique: async () => null,
      update: async () => ({}),
    },
    sourceTemp: {
      create: async () => ({}),
    },
  },
}));

vi.mock("#server/lib/configCache", () => ({
  getConfigValue: async () => "",
}));

// 转存链路不应真正触达网盘客户端：一旦走到这里说明单飞锁没挡住
vi.mock("#server/lib/pan-instance", () => ({
  getClientByAccount: async () => {
    throw new Error("不应触达网盘客户端");
  },
}));

vi.mock("#server/lib/const", () => ({ THIRTY_MINUTES: 1800 }));

vi.mock("#server/lib/geturl-record", () => ({
  GETURL_DAILY_LIMIT: 9999,
  getClientIp: () => "203.0.113.7",
  getTodayGeturlCount: async () => 0,
  incrementTodayGeturlCount: async () => {},
}));

vi.mock("#server/lib/simpleAC", () => ({
  automaton_ad_filter: { hasMatch: () => false },
}));

vi.mock("#server/utils/bot-defense", () => ({
  assertBotDefense: async () => {},
}));

vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("readBody", async () => {
  const list = h.bodies;
  const body = list[h.bodyCursor % list.length];
  h.bodyCursor++;
  return body;
});
vi.stubGlobal("createError", (options: any) =>
  Object.assign(new Error(options?.message ?? "error"), options),
);

const handler = (await import("./geturl")).default;

function makeEvent() {
  return {
    method: "POST",
    waitUntil: () => {},
    context: {},
  } as any;
}

/** 设定本次请求依次使用的 body（按 readBody 调用顺序轮询） */
function queueBodies(...bodies: any[]) {
  h.bodies = bodies;
  h.bodyCursor = 0;
}

/** 让出事件循环，等并发请求推进到锁内 */
const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 构造一个能通过 parseShareUrl 的夸克分享链接 */
const quarkLink = (fid: string) => `enc:https://pan.quark.cn/s/${fid}?pwd=abcd`;

beforeEach(() => {
  h.bodies = [];
  h.bodyCursor = 0;
  h.accountCalls = 0;
  h.accountImpl = null;
  h.redisCacheValue = null;
  h.redisKeys = [];
});

describe("geturl 并发单飞锁 inflightRequests", () => {
  it("前一个请求仍在转存时，后到的同链接请求直接复用，不重复转存", async () => {
    const gate = deferred();
    h.accountImpl = () => gate.promise;
    queueBodies({ url: quarkLink("diagSerial") }, { url: quarkLink("diagSerial") });

    const first = handler(makeEvent());
    await settle(30);
    expect(h.accountCalls).toBe(1);

    const second = handler(makeEvent());
    await settle(30);

    // 后到者应命中 inflight，转存次数保持 1
    expect(h.accountCalls).toBe(1);

    gate.resolve(null);
    await Promise.all([first, second]);
  });
  it("同一分享链接并发的 5 个请求，转存只执行 1 次", async () => {
    const gate = deferred();
    h.accountImpl = () => gate.promise;
    queueBodies({ url: quarkLink("inflightA1") });

    const requests = Array.from({ length: 5 }, () => handler(makeEvent()));

    // 5 个请求都应停在锁内的同一个 Promise 上
    await settle();
    // 诊断：确认 5 个请求算出的 cacheKey 完全一致
    expect(new Set(h.redisKeys).size).toBe(1);
    expect(h.accountCalls).toBe(1);

    // 放行：无可用账号，transferShareUrl 原样返回链接
    gate.resolve(null);
    const results = await Promise.all(requests);

    expect(results).toHaveLength(5);
    // 只有抢到锁的那个请求走的是完整链路，其余 4 个命中 inflight 分支
    expect(results.filter((r) => r.cache === "inflight")).toHaveLength(4);
    // 所有请求拿到的链接必须一致
    expect(new Set(results.map((r) => r.url)).size).toBe(1);
  });

  it("不同分享链接不会互相阻塞（锁粒度是单链接）", async () => {
    const gate1 = deferred();
    const gate2 = deferred();
    let seq = 0;
    h.accountImpl = () => (seq++ === 0 ? gate1.promise : gate2.promise);
    queueBodies(
      { url: quarkLink("inflightB1") },
      { url: quarkLink("inflightB2") },
    );

    const first = handler(makeEvent());
    const second = handler(makeEvent());

    await settle();
    // 两个不同链接各自进入转存，说明没有被全局锁串行化
    expect(h.accountCalls).toBe(2);

    gate1.resolve(null);
    gate2.resolve(null);
    const results = await Promise.all([first, second]);
    expect(results.every((r) => r.cache !== "inflight")).toBe(true);
  });

  it("请求正常完成后锁被释放，后续同链接请求会重新执行", async () => {
    h.accountImpl = async () => null;
    queueBodies({ url: quarkLink("inflightC1") }, { url: quarkLink("inflightC1") });

    await handler(makeEvent());
    await handler(makeEvent());

    expect(h.accountCalls).toBe(2);
  });

  it("转存抛错后锁依然被释放，不会让该链接永久卡死在 inflight", async () => {
    h.accountImpl = async () => {
      throw new Error("账号池异常");
    };
    queueBodies({ url: quarkLink("inflightD1") }, { url: quarkLink("inflightD1") });

    await expect(handler(makeEvent())).rejects.toThrow();
    // 若 finally 里的 delete 失效，这里会命中残留的已 reject Promise，accountCalls 不会变成 2
    await expect(handler(makeEvent())).rejects.toThrow();

    expect(h.accountCalls).toBe(2);
  });

  it("Redis 一级缓存命中时直接返回，不进入锁与转存逻辑", async () => {
    h.redisCacheValue = "https://pan.quark.cn/s/already-cached";
    h.accountImpl = async () => null;
    queueBodies({ url: quarkLink("inflightE1") });

    const result = await handler(makeEvent());

    expect(result).toEqual({
      url: "https://pan.quark.cn/s/already-cached",
      cache: "redis",
    });
    expect(h.accountCalls).toBe(0);
  });
});
