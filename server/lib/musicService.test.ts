import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 音乐共享服务测试：锁定 admin（summary 列、不过滤状态）与开放 API（full 列、status=1）共用逻辑。
 */

const h = vi.hoisted(() => ({
  queries: [] as { sql: string; values: any[] }[],
  dataRows: [{ id: "m1" }] as any[],
  countRows: [{ count: 2 }],
  creates: [] as any[],
  executeRawCalls: 0,
}));

vi.mock("@@/prisma/generated", () => {
  const Prisma = {
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({
      type: "sql",
      values,
    }),
    empty: { type: "empty" },
    raw: (value: string) => ({ type: "raw", value }),
  };
  return { Prisma };
});

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      h.queries.push({ sql: strings.join("?"), values });
      return /COUNT/i.test(strings.join("")) ? h.countRows : h.dataRows;
    },
    $executeRaw: async () => {
      h.executeRawCalls++;
      return 1;
    },
    $transaction: async (fn: (tx: any) => unknown) => fn(txMock),
  },
}));

const txMock = {
  music: {
    create: async (args: any) => {
      const row = { id: `m-${h.creates.length + 1}`, ...args.data };
      h.creates.push(row);
      return row;
    },
  },
  $executeRaw: async () => {
    h.executeRawCalls++;
    return 1;
  },
};

vi.mock("#server/utils/jieba", () => ({
  cutForSearch: (k: string) => (k === "nomatch" ? [] : ["周杰伦", "稻香"]),
  buildTokens: () => "fake-tokens",
}));

vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));

const { searchMusicByKeyword, createMusic } = await import("./musicService");

const pagination = { page: 1, pageSize: 20, skip: 0 };

const rawColumns = (values: any[]) =>
  values.filter((v) => v?.type === "raw").map((v) => v.value);
const statusConditions = (values: any[]) =>
  values.filter((v) => v?.type === "sql" || v?.type === "empty");

beforeEach(() => {
  h.queries = [];
  h.creates = [];
  h.executeRawCalls = 0;
});

describe("searchMusicByKeyword", () => {
  it("summary 列与后台原 SQL 一致，且不带 status 条件", async () => {
    const res = await searchMusicByKeyword({
      search: "周杰伦",
      pagination,
      columns: "summary",
    });

    expect(res).toEqual({ data: [{ id: "m1" }], total: 2 });
    expect(h.queries).toHaveLength(2);
    expect(h.queries[0]!.sql).toContain("ts_rank_cd");
    expect(h.queries[0]!.sql).toContain('ORDER BY h.rank DESC, m."createdAt" DESC');
    for (const q of h.queries) {
      expect(statusConditions(q.values)).toEqual([{ type: "empty" }]);
      expect(q.sql).toContain('"searchVector" @@ to_tsquery');
    }
    expect(rawColumns(h.queries[0]!.values)).toEqual([
      'm.id, m.title, m.artist, m.album, m.cover, m.status',
    ]);
    // OR 拼接的宽泛查询 + 分页
    expect(h.queries[0]!.values).toContain("周杰伦 | 稻香");
    expect(h.queries[0]!.values).toContain(20);
    expect(h.queries[0]!.values).toContain(0);
  });

  it("full 列包含歌词/播放地址/下载列表", async () => {
    await searchMusicByKeyword({ search: "周杰伦", pagination, columns: "full" });

    const [columns] = rawColumns(h.queries[0]!.values);
    for (const col of [
      "m.lyrics",
      'm."playUrl"',
      "m.downloads",
      'm."viewCount"',
      'm."createdAt"',
    ]) {
      expect(columns).toContain(col);
    }
  });

  it("传 status 时 data 与 count 两条 SQL 均带 status 条件", async () => {
    await searchMusicByKeyword({
      search: "周杰伦",
      pagination,
      columns: "full",
      status: 1,
    });

    for (const q of h.queries) {
      expect(statusConditions(q.values)).toEqual([{ type: "sql", values: [1] }]);
    }
  });

  it("分词为空时返回空集且不查库", async () => {
    const res = await searchMusicByKeyword({
      search: "nomatch",
      pagination,
      columns: "summary",
    });

    expect(res).toEqual({ data: [], total: 0 });
    expect(h.queries).toHaveLength(0);
  });
});

describe("createMusic", () => {
  it("歌名 / 歌手为空返回 400", async () => {
    await expect(createMusic({ title: " ", artist: "a" })).rejects.toMatchObject({
      statusCode: 400,
      message: "歌名不能为空",
    });
    await expect(createMusic({ title: "t", artist: 1 })).rejects.toMatchObject({
      statusCode: 400,
      message: "歌手不能为空",
    });
    expect(h.creates).toHaveLength(0);
  });

  it("downloads 非数组返回 400", async () => {
    await expect(
      createMusic({ title: "t", artist: "a", downloads: "x" }),
    ).rejects.toMatchObject({ statusCode: 400, message: "下载列表格式错误" });
  });

  it("在同一事务内创建记录并写入全文向量，缺省字段补空", async () => {
    const res = await createMusic({ title: " 歌 ", artist: " 手 " });

    expect(h.creates).toHaveLength(1);
    expect(h.creates[0]).toMatchObject({
      title: "歌",
      artist: "手",
      album: "",
      cover: "",
      lyrics: "",
      playUrl: "",
      downloads: [],
    });
    expect(h.executeRawCalls).toBe(1);
    expect(res.id).toBe("m-1");
  });
});
