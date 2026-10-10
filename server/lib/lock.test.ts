import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 分布式锁测试
 *
 * 锁定四类历史 Bug / 设计要点：
 * 1. 「先 GET 再 SET」非原子 → 多实例同时通过检查（必须 SET NX）
 * 2. 释放时不校验 token → 误删他人新抢到的锁
 * 3. 无 TTL 或持有者崩溃 → 永久死锁
 * 4. Redis 不可达时的行为必须是显式策略，不能默认「放行」
 */

const h = vi.hoisted(() => {
  type Entry = { value: string; expiresAt: number };

  const store = new Map<string, Entry>();
  let available = true;

  const alive = (key: string): Entry | undefined => {
    const e = store.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return e;
  };

  return {
    store,
    isAvailable: () => available,
    setAvailable(v: boolean) {
      available = v;
    },
    alive,
    reset() {
      store.clear();
      available = true;
    },
  };
});

vi.mock("#server/lib/redis", () => ({
  getRedis: async () => {
    if (!h.isAvailable()) return null;

    return {
      // SET key value [PX ms] [NX]
      async set(key: string, value: string, ...args: (string | number)[]) {
        let px: number | null = null;
        let nx = false;
        for (let i = 0; i < args.length; i++) {
          const flag = String(args[i]).toUpperCase();
          if (flag === "PX") px = Number(args[++i]);
          else if (flag === "EX") px = Number(args[++i]) * 1000;
          else if (flag === "NX") nx = true;
        }
        if (nx && h.alive(key)) return null;
        h.store.set(key, { value, expiresAt: Date.now() + (px ?? 0) });
        return "OK";
      },
      // 仅支持本项目用到的两段 Lua：续期（pexpire）与释放（del）
      async eval(
        script: string,
        _numKeys: number,
        key: string,
        ...argv: string[]
      ) {
        const e = h.alive(key);
        if (script.includes("pexpire")) {
          const [token, ttl] = argv;
          if (!e || e.value !== token) return 0;
          e.expiresAt = Date.now() + Number(ttl);
          return 1;
        }
        const [token] = argv;
        if (!e || e.value !== token) return 0;
        h.store.delete(key);
        return 1;
      },
    } as any;
  },
}));

const { acquireLock, withLock } = await import("./lock");

const KEY = "lock:test:sample";

beforeEach(() => {
  h.reset();
});

describe("互斥性", () => {
  it("第二个实例抢占失败，返回 locked", async () => {
    const a = await acquireLock(KEY, { renew: false });
    expect(a.acquired).toBe(true);

    const b = await acquireLock(KEY, { renew: false });
    expect(b.acquired).toBe(false);
    if (!b.acquired) expect(b.reason).toBe("locked");
  });

  it("释放后可以被再次抢占", async () => {
    const a = await acquireLock(KEY, { renew: false });
    if (!a.acquired) throw new Error("预期抢占成功");
    await a.lock.release();

    const b = await acquireLock(KEY, { renew: false });
    expect(b.acquired).toBe(true);
  });
});

describe("token 校验", () => {
  it("锁已被他人接管时，自己的 release 不会删除对方的锁", async () => {
    const a = await acquireLock(KEY, { renew: false });
    if (!a.acquired) throw new Error("预期抢占成功");

    // 模拟：A 的锁过期，B 抢到并写入自己的 token
    h.store.set(KEY, {
      value: "other-instance-token",
      expiresAt: Date.now() + 60_000,
    });

    await a.lock.release();

    // 关键断言：B 的锁必须还在，不能被 A 误删
    expect(h.store.get(KEY)?.value).toBe("other-instance-token");
  });

  it("release 幂等，重复调用不报错", async () => {
    const a = await acquireLock(KEY, { renew: false });
    if (!a.acquired) throw new Error("预期抢占成功");
    await a.lock.release();
    await expect(a.lock.release()).resolves.toBeUndefined();
  });
});

describe("TTL 兜底", () => {
  it("持有者崩溃（未释放）后，锁会过期并允许重新抢占", async () => {
    const a = await acquireLock(KEY, {
      ttlSeconds: 1, // 实现内最小钳制为 1000ms
      renew: false, // 关掉续期，才能观察过期
    });
    expect(a.acquired).toBe(true);

    await new Promise((r) => setTimeout(r, 1_100));

    const b = await acquireLock(KEY, { renew: false });
    expect(b.acquired).toBe(true);
  }, 15_000);
});

describe("Redis 不可达", () => {
  it("返回 unavailable，而不是放行", async () => {
    h.setAvailable(false);

    const res = await acquireLock(KEY, { renew: false });
    expect(res.acquired).toBe(false);
    if (!res.acquired) expect(res.reason).toBe("unavailable");
  });

  it("withLock 默认 skip：任务不执行", async () => {
    h.setAvailable(false);
    let ran = 0;

    const res = await withLock(KEY, async () => {
      ran++;
    });

    expect(ran).toBe(0);
    expect(res.executed).toBe(false);
    expect(res.skipped).toBe(true);
  });

  it("withLock onNoRedis=run：降级执行任务", async () => {
    h.setAvailable(false);
    let ran = 0;

    const res = await withLock(
      KEY,
      async () => {
        ran++;
        return 42;
      },
      { onNoRedis: "run" },
    );

    expect(ran).toBe(1);
    expect(res.executed).toBe(true);
    expect(res.result).toBe(42);
  });
});

describe("withLock", () => {
  it("任务抛异常时仍会释放锁", async () => {
    await expect(
      withLock(
        KEY,
        async () => {
          throw new Error("boom");
        },
        { renew: false },
      ),
    ).rejects.toThrow("boom");

    // 锁必须已被释放，否则下一次永远抢不到
    const again = await acquireLock(KEY, { renew: false });
    expect(again.acquired).toBe(true);
  });

  it("正常执行后释放锁，并回传结果", async () => {
    const res = await withLock(
      KEY,
      async () => "done",
      { renew: false },
    );

    expect(res.executed).toBe(true);
    expect(res.result).toBe("done");
    expect(h.store.has(KEY)).toBe(false);
  });

  it("并发调用只有一个能进入临界区", async () => {
    let entered = 0;

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        withLock(
          KEY,
          async () => {
            entered++;
          },
          { renew: false },
        ),
      ),
    );

    expect(entered).toBe(1);
    expect(results.filter((r) => r.skipped).length).toBe(4);
  });
});
