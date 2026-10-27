import { beforeEach, describe, expect, it } from "vitest";
import {
  KeyLockTimeoutError,
  __resetKeyLocks,
  withKeyLock,
} from "./keyedLock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withKeyLock（按 key 串行）", () => {
  beforeEach(() => {
    __resetKeyLocks();
  });

  it("同一个 key 严格串行，不会并发进入", async () => {
    const events: string[] = [];
    let running = 0;
    let maxConcurrent = 0;

    const task = (tag: string) => async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      events.push(`${tag}:enter`);
      await sleep(15);
      events.push(`${tag}:exit`);
      running--;
      return tag;
    };

    const results = await Promise.all([
      withKeyLock("k", task("a")),
      withKeyLock("k", task("b")),
      withKeyLock("k", task("c")),
    ]);

    expect(results).toEqual(["a", "b", "c"]);
    expect(maxConcurrent).toBe(1);
    // 先进先出：每个 exit 后面才可能出现下一个 enter
    expect(events).toEqual([
      "a:enter",
      "a:exit",
      "b:enter",
      "b:exit",
      "c:enter",
      "c:exit",
    ]);
  });

  it("不同 key 互不阻塞", async () => {
    let running = 0;
    let maxConcurrent = 0;
    const task = async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await sleep(20);
      running--;
    };

    await Promise.all([
      withKeyLock("k1", task),
      withKeyLock("k2", task),
      withKeyLock("k3", task),
    ]);

    expect(maxConcurrent).toBe(3);
  });

  it("处理函数抛错也会释放锁，后来者能继续", async () => {
    await expect(
      withKeyLock("k", async () => {
        await sleep(5);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // 若锁没释放，这里会等到 waitMs 超时
    await expect(
      withKeyLock("k", async () => "ok", { waitMs: 200 }),
    ).resolves.toBe("ok");
  });

  it("等待超时抛 409，且不会让锁链僵死", async () => {
    let releaseHolder!: () => void;
    const holder = withKeyLock("k", () =>
      new Promise<void>((resolve) => {
        releaseHolder = resolve;
      }),
    );

    // 排队的第二个请求等不到
    await expect(
      withKeyLock("k", async () => "never", { waitMs: 30 }),
    ).rejects.toBeInstanceOf(KeyLockTimeoutError);

    // 持有者放行后，锁仍然可用（超时者已把自己从链上摘掉）
    releaseHolder();
    await holder;
    await expect(
      withKeyLock("k", async () => "after", { waitMs: 200 }),
    ).resolves.toBe("after");
  });

  it("超时错误带 statusCode=409，便于直接透传给 HTTP 层", async () => {
    let releaseHolder!: () => void;
    const holder = withKeyLock("k2", () =>
      new Promise<void>((resolve) => {
        releaseHolder = resolve;
      }),
    );

    const err = await withKeyLock("k2", async () => "", {
      waitMs: 20,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(KeyLockTimeoutError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("ELOCKTIMEOUT");

    releaseHolder();
    await holder;
  });
});
