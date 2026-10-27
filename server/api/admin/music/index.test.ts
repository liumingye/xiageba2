import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 后台音乐更新接口测试
 *
 * 锁定历史风险：PUT 早按全量字段更新，状态开关只传 { id, status } 时
 * 会把 downloads 等字段清成空。现在必须是部分字段更新。
 */

const h = vi.hoisted(() => ({
  body: {} as any,
  updateCalls: [] as any[],
  executeRawCalls: 0,
}));

const dbRow = {
  id: "m1",
  title: "歌名",
  artist: "歌手",
  album: "专辑",
  cover: "",
  lyrics: "",
  playUrl: "",
  downloads: [],
  status: 1,
};

vi.mock("#server/lib/prisma", () => {
  const txMock = {
    music: {
      update: async (args: any) => {
        h.updateCalls.push(args);
        return { ...dbRow, ...args.data };
      },
    },
    $executeRaw: async () => {
      h.executeRawCalls++;
      return 1;
    },
  };

  return {
    prisma: {
      ...txMock,
      // 生产代码把主记录与全文索引放进同一事务，测试直接执行同一组 mock
      $transaction: async (fn: (tx: typeof txMock) => unknown) => fn(txMock),
    },
  };
});

vi.mock("#server/utils/jieba", () => ({
  buildTokens: () => "fake-tokens",
  cutForSearch: () => [],
}));

// Nitro 自动导入
vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("readBody", async () => h.body);
vi.stubGlobal("createError", (o: any) => ({ ...o }));
vi.stubGlobal("useStorage", () => ({
  getKeys: async () => ["music_m1:payload", "other"],
  removeItem: async () => {},
}));

const { default: handler } = await import("./index");

// handler 用 createError 抛错，测试里统一捕获后按返回值断言
const run = async (body: any) => {
  h.body = body;
  try {
    return await handler({ method: "PUT" } as any);
  } catch (e) {
    return e as any;
  }
};

beforeEach(() => {
  h.body = {};
  h.updateCalls = [];
  h.executeRawCalls = 0;
});

describe("PUT 部分字段更新", () => {
  it("只传 id + status 时，update 数据只有 status，不动其他字段", async () => {
    const res: any = await run({ id: "m1", status: 0 });

    expect(h.updateCalls).toHaveLength(1);
    expect(h.updateCalls[0].data).toEqual({ status: 0 });
    // 纯切状态不重建全文检索向量
    expect(h.executeRawCalls).toBe(0);
    expect(res.status).toBe(0);
  });

  it("字符串 '0' 的 status 按禁用处理", async () => {
    await run({ id: "m1", status: "0" });

    expect(h.updateCalls[0].data).toEqual({ status: 0 });
  });

  it("编辑页全量字段保存时所有字段都写入", async () => {
    await run({
      id: "m1",
      title: "新歌名",
      artist: "新歌手",
      album: "新专辑",
      cover: "https://example.com/cover.jpg",
      lyrics: "歌词",
      playUrl: "https://example.com/a.mp3",
      downloads: [{ quality: "FLAC", url: "https://example.com/a.flac" }],
    });

    expect(h.updateCalls[0].data).toEqual({
      title: "新歌名",
      artist: "新歌手",
      album: "新专辑",
      cover: "https://example.com/cover.jpg",
      lyrics: "歌词",
      playUrl: "https://example.com/a.mp3",
      downloads: [{ quality: "FLAC", url: "https://example.com/a.flac" }],
    });
    // 标题/歌手变化才重建搜索向量
    expect(h.executeRawCalls).toBe(1);
  });

  it("编辑页清空下载链接时 downloads 写入空数组", async () => {
    await run({
      id: "m1",
      title: "歌名",
      artist: "歌手",
      album: "专辑",
      cover: "",
      lyrics: "",
      playUrl: "",
      downloads: [],
    });

    expect(h.updateCalls[0].data.downloads).toEqual([]);
  });

  it("缺少 id 拒绝更新", async () => {
    const res: any = await run({ status: 1 });

    expect(res.statusCode).toBe(400);
    expect(h.updateCalls.length).toBe(0);
  });

  it("没有任何可更新字段时拒绝，而不是清库", async () => {
    const res: any = await run({ id: "m1" });

    expect(res.statusCode).toBe(400);
    expect(h.updateCalls.length).toBe(0);
  });
});
