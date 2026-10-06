import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AI 客户端工厂测试
 *
 * 覆盖两类历史 Bug：
 * 1. 每请求 new OpenAI() → 连接与内部资源无法复用
 * 2. 不传 timeout/maxRetries → SDK 默认 600s 超时 + 2 次重试，上游挂起时
 *    排队机槽位被长期占用
 */

const h = vi.hoisted(() => {
  class FakeOpenAI {
    constructor(public options: any) {
      (globalThis as any).__openaiInstances.push(this);
    }
  }
  return { FakeOpenAI };
});

vi.mock("openai", () => ({ OpenAI: h.FakeOpenAI }));

const load = async () => {
  vi.resetModules();
  return await import("./aiClient");
};

const base = { baseURL: "https://api.example.com/v1", apiKey: "sk-test-1" };

describe("getAiChatClient", () => {
  beforeEach(() => {
    (globalThis as any).__openaiInstances = [];
  });

  it("必须显式设置 timeout，且不能是 SDK 默认的 600 秒", async () => {
    const { getAiChatClient, AI_REQUEST_TIMEOUT_MS } = await load();
    getAiChatClient(base);

    const opts = (globalThis as any).__openaiInstances[0].options;
    expect(opts.timeout).toBe(AI_REQUEST_TIMEOUT_MS);
    expect(opts.timeout).toBeGreaterThan(0);
    expect(opts.timeout).toBeLessThan(600_000);
  });

  it("baseURL 与 apiKey 必须原样透传", async () => {
    const { getAiChatClient } = await load();
    getAiChatClient(base);

    const opts = (globalThis as any).__openaiInstances[0].options;
    expect(opts.baseURL).toBe(base.baseURL);
    expect(opts.apiKey).toBe(base.apiKey);
  });

  it("相同配置必须复用同一个客户端实例", async () => {
    const { getAiChatClient } = await load();

    const a = getAiChatClient(base);
    const b = getAiChatClient({ ...base });

    expect(a).toBe(b);
    expect((globalThis as any).__openaiInstances).toHaveLength(1);
  });

  it("apiKey 变更后必须换用新实例", async () => {
    const { getAiChatClient } = await load();

    const a = getAiChatClient(base);
    const b = getAiChatClient({ ...base, apiKey: "sk-test-2" });

    expect(a).not.toBe(b);
    expect((globalThis as any).__openaiInstances).toHaveLength(2);
    expect((globalThis as any).__openaiInstances[1].options.apiKey).toBe(
      "sk-test-2",
    );
  });

  it("baseURL 变更后必须换用新实例", async () => {
    const { getAiChatClient } = await load();

    getAiChatClient(base);
    getAiChatClient({ ...base, baseURL: "https://api.other.com/v1" });

    expect((globalThis as any).__openaiInstances).toHaveLength(2);
  });

  it("缓存条数必须有上限，超出后淘汰最早的客户端", async () => {
    const { getAiChatClient } = await load();

    const first = getAiChatClient(base);
    for (let i = 1; i < 8; i++) {
      getAiChatClient({ baseURL: base.baseURL, apiKey: `sk-${i}` });
    }
    // 此时已放满 8 条
    expect((globalThis as any).__openaiInstances).toHaveLength(8);

    // 第 9 条配置进来 → 最早的（first）被淘汰
    getAiChatClient({ baseURL: base.baseURL, apiKey: "sk-overflow" });
    const again = getAiChatClient(base);

    expect(again).not.toBe(first);
  });

  it("支持用环境变量覆盖超时与重试次数", async () => {
    process.env.AI_SEARCH_TIMEOUT_MS = "1500";
    try {
      const { getAiChatClient, AI_REQUEST_TIMEOUT_MS } = await load();
      getAiChatClient(base);

      expect(AI_REQUEST_TIMEOUT_MS).toBe(1500);
      expect((globalThis as any).__openaiInstances[0].options.timeout).toBe(
        1500,
      );
    } finally {
      delete process.env.AI_SEARCH_TIMEOUT_MS;
    }
  });

  it("环境变量传非法值时必须回退到默认值，而不是变成 0 或 NaN", async () => {
    process.env.AI_SEARCH_TIMEOUT_MS = "abc";
    try {
      const { AI_REQUEST_TIMEOUT_MS } = await load();

      expect(AI_REQUEST_TIMEOUT_MS).toBe(10_000);
    } finally {
      delete process.env.AI_SEARCH_TIMEOUT_MS;
    }
  });
});

afterEach(() => {
  delete (globalThis as any).__openaiInstances;
});
