import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * configCache 的缓存一致性测试
 *
 * 覆盖两类历史 Bug：
 * 1. 冷缓存时写入配置，会把「只含本次 key 的 Map」当成全量缓存锁 24h
 *    → 其余配置全部读成空串（缓存投毒）
 * 2. 批量写入用 Promise.all 非事务，部分失败无法回滚，且失败时仍写缓存
 */

const h = vi.hoisted(() => ({
  db: new Map<string, string>(),
  txCalls: 0,
  failTx: false,
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    config: {
      findMany: async () =>
        Array.from(h.db, ([key, value]) => ({ key, value })),
      upsert: async (args: { where: { key: string }; update: { value: string } }) => {
        h.db.set(args.where.key, args.update.value);
        return { key: args.where.key, value: args.update.value };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => {
      h.txCalls++;
      if (h.failTx) throw new Error("transaction rolled back");
      return Promise.all(ops);
    },
  },
}));

const {
  getConfigValue,
  setConfigValue,
  setConfigValues,
  clearConfigCache,
} = await import("./configCache");

beforeEach(() => {
  h.db.clear();
  h.txCalls = 0;
  h.failTx = false;
  clearConfigCache();
});

describe("配置写入后的缓存一致性", () => {
  it("冷缓存写入单个配置后，其它配置仍能从数据库读到真实值（不被投毒成空串）", async () => {
    h.db.set("other_key", "real-value");

    // 此时 memoryCache 为 null（冷缓存）
    await setConfigValue("aes_key", "abc");

    // 关键断言：旧实现在这里会返回 ""，导致 redis_host / aes / pancheck 等全部失效
    expect(await getConfigValue("other_key")).toBe("real-value");
    expect(await getConfigValue("aes_key")).toBe("abc");
  });

  it("热缓存写入时走增量更新，不重新查库", async () => {
    h.db.set("k1", "v1");
    await getConfigValue("k1"); // 建立缓存

    await setConfigValue("k2", "v2");

    // 缓存里已有 k2，无需回源也能读到
    expect(await getConfigValue("k2")).toBe("v2");
    expect(await getConfigValue("k1")).toBe("v1");
  });

  it("批量写入走单个事务，而非 N 个独立 upsert", async () => {
    await setConfigValues([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);

    expect(h.txCalls).toBe(1);
    expect(h.db.get("a")).toBe("1");
    expect(h.db.get("b")).toBe("2");
  });

  it("事务失败时整体抛出，且绝不污染缓存", async () => {
    h.db.set("x", "old");
    await getConfigValue("x"); // 建立热缓存 = old

    h.failTx = true;
    await expect(setConfigValues([{ key: "x", value: "new" }])).rejects.toThrow(
      "transaction rolled back",
    );
    h.failTx = false;

    // 写入失败 → 缓存必须保持原值，不能是半写入的 "new"
    expect(await getConfigValue("x")).toBe("old");
  });

  it("value 为 undefined 表示不修改，DB 与缓存都不应被写成空串", async () => {
    h.db.set("keep", "original");
    await getConfigValue("keep"); // 建立热缓存 = original

    await setConfigValues([{ key: "keep", value: undefined }]);

    expect(await getConfigValue("keep")).toBe("original");
  });

  it("全部 value 均为 undefined 时不发起任何事务", async () => {
    await setConfigValues([{ key: "a", value: undefined }]);
    expect(h.txCalls).toBe(0);
  });
});
