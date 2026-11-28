import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 资源共享服务测试：锁定 admin 与开放 API 共用的关键词搜索与批量新建逻辑。
 */

const h = vi.hoisted(() => ({
  queries: [] as { sql: string; params: any[] }[],
  releaseCalls: 0,
  queryError: null as Error | null,
  dataRows: [{ id: "s1" }],
  countRows: [{ count: "1" }],
  existing: [] as any[],
  findManyArgs: [] as any[],
  creates: [] as any[],
  updates: [] as any[],
  executeRawCalls: 0,
  executeRawVia: [] as ("tx" | "root")[],
  transactions: 0,
  createError: null as Error | null,
  createCalls: 0,
  createFailAt: 0,
}));

// 原生 SQL 走 lib/prisma 导出的共享池 dbPool；这里不再 mock "pg"
vi.mock("#server/lib/prisma", () => {
  const source = {
    findMany: async (args: any) => {
      h.findManyArgs.push(args);
      return h.existing;
    },
    create: async (args: any) => {
      h.createCalls++;
      if (h.createError || h.createCalls === h.createFailAt) {
        throw h.createError || new Error("boom");
      }
      const row = {
        id: `new-${h.creates.length + 1}`,
        description: "",
        menu: "",
        ...args.data,
      };
      h.creates.push(row);
      return row;
    },
    update: async (args: any) => {
      const row = { id: args.where.id, description: "", menu: "", ...args.data };
      h.updates.push(row);
      return row;
    },
  };
  const executeRaw = (via: "tx" | "root") => async () => {
    h.executeRawCalls++;
    h.executeRawVia.push(via);
    return 1;
  };
  // 事务客户端：与顶层 prisma 共用同一组 source 操作，并记录向量更新是否经由事务发起
  const tx = { source, $executeRaw: executeRaw("tx") };
  return {
    prisma: {
      source,
      $executeRaw: executeRaw("root"),
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
        h.transactions++;
        return await fn(tx);
      },
    },
    dbPool: {
      connect: async () => ({
        query: async (sql: string, params: any[]) => {
          if (h.queryError) throw h.queryError;
          h.queries.push({ sql, params });
          return { rows: /COUNT/i.test(sql) ? h.countRows : h.dataRows };
        },
        release: () => {
          h.releaseCalls++;
        },
      }),
    },
  };
});

vi.mock("#server/utils/jieba", () => ({
  cutForSearch: (k: string) => (k === "nomatch" ? [] : ["mp3"]),
  buildSearchWebQuery: (tokens: string[]) => tokens.join(" & "),
}));

vi.mock("#server/utils/source", () => ({
  buildSourceSearchTokens: () => "fake-tokens",
}));

vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));

const { searchSourcesByKeyword, createSources } = await import("./sourceService");

const pagination = { page: 1, pageSize: 20, skip: 0 };

beforeEach(() => {
  // 还原上一条用例安装的 console.error 监听，避免层层叠加导致调用次数翻倍
  vi.restoreAllMocks();

  h.queries = [];
  h.releaseCalls = 0;
  h.queryError = null;
  h.existing = [];
  h.findManyArgs = [];
  h.creates = [];
  h.updates = [];
  h.executeRawCalls = 0;
  h.executeRawVia = [];
  h.transactions = 0;
  h.createError = null;
  h.createCalls = 0;
  h.createFailAt = 0;
});

describe("searchSourcesByKeyword", () => {
  it("不传 status 时与后台原查询一致：SQL 不含 status 条件", async () => {
    const res = await searchSourcesByKeyword({
      keyword: "mp3",
      cid: null,
      pagination,
    });

    expect(res).toEqual({ data: [{ id: "s1" }], total: 1 });
    expect(h.queries).toHaveLength(2);
    for (const q of h.queries) {
      expect(q.sql).not.toContain("status =");
      expect(q.sql).toContain('"searchVector" @@ search_query.value');
    }
    // 关键词 + 分页
    expect(h.queries[0]!.params).toEqual(["mp3", 20, 0]);
    expect(h.queries[1]!.params).toEqual(["mp3"]);
    expect(h.releaseCalls).toBe(1);
  });

  it("传 status 时 data 与 count 两条 SQL 均带 status 条件，且排在 cid 之前", async () => {
    await searchSourcesByKeyword({
      keyword: "mp3",
      cid: 2,
      pagination,
      status: 1,
    });

    expect(h.queries).toHaveLength(2);
    for (const q of h.queries) {
      expect(q.sql).toContain("status = $1 AND cid = $2");
    }
    expect(h.queries[0]!.params).toEqual([1, 2, "mp3", 20, 0]);
    expect(h.queries[1]!.params).toEqual([1, 2, "mp3"]);
  });

  it("URL 精准匹配不走全文检索，按创建时间排序", async () => {
    await searchSourcesByKeyword({
      keyword: "https://pan.baidu.com/s/1abc",
      cid: null,
      pagination,
      status: 1,
    });

    const [dataQuery] = h.queries;
    expect(dataQuery!.sql).toContain("url = $2");
    expect(dataQuery!.sql).toContain('ORDER BY "createdAt" DESC, id ASC');
    expect(dataQuery!.sql).not.toContain("ts_rank");
    expect(dataQuery!.params[0]).toBe(1);
  });

  it("查询抛错时也释放连接", async () => {
    h.queryError = new Error("db down");

    await expect(
      searchSourcesByKeyword({ keyword: "mp3", cid: null, pagination }),
    ).rejects.toThrow("db down");
    expect(h.releaseCalls).toBe(1);
  });
});

describe("createSources", () => {
  it("名称为空返回 400", async () => {
    await expect(createSources({ title: "  ", urls: ["a"] })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("地址为空返回 400", async () => {
    await expect(createSources({ title: "t", urls: [" ", ""] })).rejects.toMatchObject({
      statusCode: 400,
      message: "资源地址不能为空",
    });
    await expect(createSources({ title: "t", urls: "a" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("地址自动 trim、去重、去空后再查重", async () => {
    await createSources({ title: "t", urls: [" a ", "a", ""] });

    expect(h.findManyArgs[0].where).toEqual({ url: { in: ["a"] } });
    expect(h.creates).toHaveLength(1);
    expect(h.creates[0]).toMatchObject({
      url: "a",
      title: "t",
      cid: null,
      isSelf: false,
    });
    // 新建后重建全文向量
    expect(h.executeRawCalls).toBe(1);
  });

  it("存在重复且未指定处理方式时抛 409 并携带 duplicates", async () => {
    h.existing = [{ id: "s1", title: "old", url: "a" }];

    await expect(createSources({ title: "t", urls: ["a"] })).rejects.toMatchObject({
      statusCode: 409,
      data: { duplicates: h.existing },
    });
    expect(h.creates).toHaveLength(0);
  });

  it("skipDuplicates：跳过重复、插入不重复的", async () => {
    h.existing = [{ id: "s1", title: "old", url: "a" }];

    const res = await createSources({
      title: "t",
      urls: ["a", "b"],
      skipDuplicates: true,
    });

    expect(res).toEqual({
      success: true,
      inserted: 1,
      updated: 0,
      duplicate: 1,
      failed: 0,
      errors: [],
    });
    expect(h.creates.map((c) => c.url)).toEqual(["b"]);
    expect(h.updates).toHaveLength(0);
  });

  it("updateExisting：更新已有记录并重建向量", async () => {
    h.existing = [{ id: "s1", title: "old", url: "a" }];

    const res = await createSources({
      title: "new",
      urls: ["a"],
      updateExisting: true,
    });

    expect(res).toEqual({
      success: true,
      inserted: 0,
      updated: 1,
      duplicate: 0,
      failed: 0,
      errors: [],
    });
    expect(h.updates[0]).toMatchObject({ id: "s1", title: "new" });
    expect(h.executeRawCalls).toBe(1);
    expect(h.creates).toHaveLength(0);
  });

  it("force：地址重复也插入新记录", async () => {
    h.existing = [{ id: "s1", title: "old", url: "a" }];

    const res = await createSources({ title: "t", urls: ["a"], force: true });

    expect(res.inserted).toBe(1);
    expect(h.creates[0].url).toBe("a");
  });

  it("单条写入失败计入 failed，不影响其余地址", async () => {
    h.createFailAt = 1;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await createSources({ title: "t", urls: ["a", "b"] });

    expect(res).toMatchObject({ inserted: 1, updated: 0, duplicate: 0, failed: 1 });
    expect(h.creates.map((c) => c.url)).toEqual(["b"]);
  });

  it("每条写入（含向量更新）都在各自的事务里完成，向量不脱离事务单独执行", async () => {
    h.existing = [{ id: "s1", title: "old", url: "a" }];

    await createSources({ title: "t", urls: ["a", "b"], updateExisting: true });

    // a 更新、b 新建：两次写入对应两个事务，两次向量更新都经由事务客户端
    expect(h.transactions).toBe(2);
    expect(h.executeRawVia).toEqual(["tx", "tx"]);
  });

  describe("失败原因", () => {
    const errorOf = (fields: Record<string, unknown>) => Object.assign(new Error("raw"), fields);

    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("响应里给出失败地址与原因，完整异常写入服务端日志", async () => {
      h.createError = errorOf({ code: "P2020" });

      const res = await createSources({ title: "t", urls: ["a"] });

      expect(res.failed).toBe(1);
      expect(res.errors).toEqual([{ url: "a", reason: "字段值超出取值范围" }]);
      expect(console.error).toHaveBeenCalledTimes(1);
      const [message, err] = vi.mocked(console.error).mock.calls[0]!;
      expect(String(message)).toContain("url=a");
      expect(err).toBe(h.createError);
    });

    it("原始错误信息（含主机、路径、堆栈）不出现在给调用方的原因里", async () => {
      h.createError = Object.assign(
        new Error(
          "Invalid `tx.source.create()` invocation in C:/app/server.ts:12:3\nCan't reach database server at `10.0.0.5:5432`",
        ),
        { code: "P1001" },
      );

      const res = await createSources({ title: "t", urls: ["a"] });

      expect(res.errors).toEqual([{ url: "a", reason: "数据库错误（P1001）" }]);
      expect(JSON.stringify(res)).not.toMatch(/10\.0\.0\.5|server\.ts/);
    });

    it.each([
      ["P2000", undefined, "字段值超出长度限制"],
      ["P2002", undefined, "违反唯一约束"],
      ["P2003", undefined, "关联的记录不存在"],
      ["P2020", undefined, "字段值超出取值范围"],
      ["P1010", undefined, "数据库错误（P1010）"],
      [undefined, "PrismaClientValidationError", "参数校验未通过"],
      [undefined, undefined, "写入失败"],
    ])("code=%s name=%s → %s", async (code, name, reason) => {
      h.createError = errorOf({ code, name });

      const res = await createSources({ title: "t", urls: ["a"] });

      expect(res.errors).toEqual([{ url: "a", reason }]);
    });

    it("非 Error 类型的异常也能给出原因", async () => {
      h.createError = "just a string" as unknown as Error;

      const res = await createSources({ title: "t", urls: ["a"] });

      expect(res.errors).toEqual([{ url: "a", reason: "写入失败" }]);
    });

    it("多条失败时逐条对应", async () => {
      h.createError = errorOf({ code: "P2000" });

      const res = await createSources({ title: "t", urls: ["a", "b"] });

      expect(res.failed).toBe(2);
      expect(res.errors).toEqual([
        { url: "a", reason: "字段值超出长度限制" },
        { url: "b", reason: "字段值超出长度限制" },
      ]);
    });
  });
});
