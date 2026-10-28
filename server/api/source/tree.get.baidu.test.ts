import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/source/tree 百度网盘分支的递归行为测试。
 *
 * 背景：tree.get.ts 重构后，各网盘只提供 listChildren 回调，递归由 lib/pan/tree.ts 统一驱动。
 * 百度这一支最容易出问题：子目录 id 取的是 wxlist 返回的 path，seckey 又需要逐层下发。
 * 本文件用假 client 把整条链路跑通，锁住「能展开子目录」这个行为。
 */

const h = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  /** 记录每次 wxlist 收到的参数，用于核对 dir / sekey / root 是否符合预期 */
  calls: [] as any[],
  /** 每个目录返回的原始条目，测试可覆盖 */
  responses: {} as Record<string, { list: any[]; seckey?: string }>,
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    source: { findUnique: async () => null },
    config: { findMany: async () => [] },
    $executeRaw: async () => 0,
  },
}));

vi.mock("#server/lib/redis", () => ({
  getRedisCache: async () => null,
  setRedisCache: async () => {},
}));

vi.mock("#server/lib/crypto", () => ({
  decryptUrl: async (v: string) => v.replace(/^enc:/, ""),
}));

vi.mock("#server/utils/bot-defense", () => ({
  assertBotDefense: async () => {},
}));

vi.mock("#server/lib/accountCache", () => ({
  getRandomAccountByType: async () => ({ id: 1, type: "baidu" }),
}));

vi.mock("#server/lib/pan-instance", () => ({
  getClientByAccount: async () => ({
    fsShareApi: {
      wxlist: async (params: any) => {
        h.calls.push(params);
        return h.responses[params.dir] ?? { list: [], seckey: "" };
      },
    },
  }),
}));

vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("getQuery", () => h.query);
vi.stubGlobal("createError", (options: any) =>
  Object.assign(new Error(options?.message ?? "error"), options),
);

const handler = (await import("./tree.get")).default;

const event = { context: {}, method: "GET" } as any;

const BAIDU_URL =
  "enc:https://pan.baidu.com/s/1AbCdEf?pwd=6666";

describe("/api/source/tree 百度分支", () => {
  beforeEach(() => {
    h.calls = [];
    h.query = { url: BAIDU_URL };
    h.responses = {
      "/": {
        seckey: "ROOT_SEKEY",
        list: [{ fs_id: 1, server_filename: "电影", isdir: 1, path: "/电影" }],
      },
      "/电影": {
        seckey: "DIR_SEKEY",
        list: [
          { fs_id: 2, server_filename: "片名.mp4", isdir: 0, path: "/电影/片名.mp4" },
        ],
      },
    };
  });

  it("isdir 为数字 1 时能展开子目录", async () => {
    const res: any = await handler(event);
    expect(res.tree).toContain("片名.mp4");
  });

  it("isdir 为字符串 \"1\" 时同样要能展开子目录", async () => {
    // 百度接口历史上返回过字符串形式的 isdir，truthy 判断能过，严格等于 1 不能
    h.responses["/"] = {
      seckey: "ROOT_SEKEY",
      list: [{ fs_id: 1, server_filename: "电影", isdir: "1", path: "/电影" }],
    };
    const res: any = await handler(event);
    expect(res.tree).toContain("片名.mp4");
  });

  it("isdir 为布尔 true 时同样要能展开子目录", async () => {
    h.responses["/"] = {
      seckey: "ROOT_SEKEY",
      list: [{ fs_id: 1, server_filename: "电影", isdir: true, path: "/电影" }],
    };
    const res: any = await handler(event);
    expect(res.tree).toContain("片名.mp4");
  });

  it("根目录先探活再取列表；子目录带父层 seckey 且 root=0", async () => {
    await handler(event);

    const rootCalls = h.calls.filter((c) => c.dir === "/");
    // 第一次是探活（只取 seckey，不带 sekey 参数），第二次才是真正的列表请求
    expect(rootCalls.length).toBeGreaterThanOrEqual(2);
    expect(rootCalls.some((c) => c.sekey === "ROOT_SEKEY")).toBe(true);

    const dirCall = h.calls.find((c) => c.dir === "/电影");
    expect(dirCall).toMatchObject({ root: 0, sekey: "ROOT_SEKEY" });
  });

  it("多级目录逐层下探", async () => {
    h.responses["/"] = {
      seckey: "K0",
      list: [{ fs_id: 1, server_filename: "一级", isdir: 1, path: "/一级" }],
    };
    h.responses["/一级"] = {
      seckey: "K1",
      list: [{ fs_id: 2, server_filename: "二级", isdir: 1, path: "/一级/二级" }],
    };
    h.responses["/一级/二级"] = {
      seckey: "K2",
      list: [
        { fs_id: 3, server_filename: "结局.mp4", isdir: 0, path: "/一级/二级/结局.mp4" },
      ],
    };

    const res: any = await handler(event);
    expect(res.tree).toBe(
      ["一级", "└─ 二级", "  └─ 结局.mp4"].join("\n"),
    );
    // 每层拿到的是父层响应的 seckey
    expect(h.calls.find((c) => c.dir === "/一级")?.sekey).toBe("K0");
    expect(h.calls.find((c) => c.dir === "/一级/二级")?.sekey).toBe("K1");
  });
});
