// AI 请求并发队列测试：覆盖 RequestQueue 的并发通行、排队、释放、位置通知
// 对应源码：server/utils/queue.ts
//
// 注意：aiRequestQueue 是全局单例（maxConcurrent=10），状态跨用例共享。
// 每个用例必须显式消费所有 release 函数（包括被唤醒的排队者返回的 release），
// 否则 activeCount 不会归零，后续用例的 fillSlots 会永久阻塞。

import { describe, expect, it, vi } from "vitest";
import { aiRequestQueue } from "./queue";

/** 等待微任务 + 宏任务一轮，让 Promise 链充分推进 */
const tick = () => new Promise<void>((r) => setTimeout(() => r(), 0));

/** 占满 10 个并发槽，返回 10 个 release。调用方必须全部消费 */
async function fillSlots(n = 10) {
  const releases: Array<() => void> = [];
  for (let i = 0; i < n; i++) {
    const release = await aiRequestQueue.enter(`fill-${i}`, vi.fn());
    releases.push(release);
  }
  return releases;
}

/**
 * 工具：安全清理一组 pending Promise + 占位 release。
 * 逐个释放占位，让 pending 被唤醒后立刻消费其 release，确保 activeCount 归零。
 */
async function drainAll(
  fills: Array<() => void>,
  pendings: Array<Promise<() => void>>,
) {
  // 把每个 pending 唤醒后立刻 release
  const pendingIter = [...pendings];
  for (const fill of fills) {
    fill();
    if (pendingIter.length > 0) {
      const release = await pendingIter.shift()!;
      release();
    }
  }
  // 还有多余 pending（理论不会出现，除非 fill 数 < pending 数）
  for (const p of pendingIter) {
    const r = await p;
    r();
  }
  await tick();
}

describe("aiRequestQueue（RequestQueue 单例）", () => {
  it("并发未满时立即通行，不触发 onProgress", async () => {
    const onProgress = vi.fn();
    const release = await aiRequestQueue.enter("happy", onProgress);
    expect(typeof release).toBe("function");
    expect(onProgress).not.toHaveBeenCalled();
    release();
  });

  it("并发满后进入排队，onProgress 报告位置 1", async () => {
    const releases = await fillSlots(10);
    try {
      const onProgress = vi.fn();
      const pending = aiRequestQueue.enter("queued-1", onProgress);
      await tick();

      expect(onProgress).toHaveBeenCalledWith(1);
      // 还未 resolve
      let resolved = false;
      pending.then(() => (resolved = true));
      await tick();
      expect(resolved).toBe(false);

      await drainAll(releases, [pending]);
    } catch (e) {
      await drainAll(releases, []);
      throw e;
    }
    await tick();
  });

  it("释放一个槽位后，队首被唤醒并返回 release", async () => {
    const releases = await fillSlots(10);
    const onProgress1 = vi.fn();
    const onProgress2 = vi.fn();
    const p1 = aiRequestQueue.enter("q1", onProgress1);
    const p2 = aiRequestQueue.enter("q2", onProgress2);
    await tick();

    try {
      expect(onProgress1).toHaveBeenCalledWith(1);
      expect(onProgress2).toHaveBeenCalledWith(2);

      // 释放第一个占位 → q1 唤醒
      releases[0]!();
      const r1 = await p1;
      expect(typeof r1).toBe("function");

      // q2 位置前移到 1
      expect(onProgress2).toHaveBeenCalledWith(1);

      await drainAll(releases.slice(1), [p2]);
      r1();
    } catch (e) {
      await drainAll(releases, [p1, p2]);
      throw e;
    }
    await tick();
  });

  it("多个排队者按 FIFO 顺序唤醒", async () => {
    const releases = await fillSlots(10);
    const order: string[] = [];
    const p1 = aiRequestQueue
      .enter("a", () => {})
      .then((r) => {
        order.push("a");
        return r;
      });
    const p2 = aiRequestQueue
      .enter("b", () => {})
      .then((r) => {
        order.push("b");
        return r;
      });
    const p3 = aiRequestQueue
      .enter("c", () => {})
      .then((r) => {
        order.push("c");
        return r;
      });
    await tick();

    try {
      // 逐个释放占位 → 按进入顺序唤醒一个
      releases[0]!();
      const r1 = await p1;
      releases[1]!();
      const r2 = await p2;
      releases[2]!();
      const r3 = await p3;

      expect(order).toEqual(["a", "b", "c"]);

      r1();
      r2();
      r3();
      await drainAll(releases.slice(3), []);
    } catch (e) {
      await drainAll(releases, [p1, p2, p3]);
      throw e;
    }
    await tick();
  });

  it("位置更新广播给所有等待者", async () => {
    const releases = await fillSlots(10);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    const p1 = aiRequestQueue.enter("p1", cb1);
    const p2 = aiRequestQueue.enter("p2", cb2);
    const p3 = aiRequestQueue.enter("p3", cb3);
    await tick();

    try {
      // 初始位置通知
      expect(cb1).toHaveBeenCalledWith(1);
      expect(cb2).toHaveBeenCalledWith(2);
      expect(cb3).toHaveBeenCalledWith(3);

      // 释放一个占位 → p1 唤醒，p2/p3 位置前移
      releases[0]!();
      const r1 = await p1;
      await tick();

      expect(cb2).toHaveBeenCalledWith(1);
      expect(cb3).toHaveBeenCalledWith(2);

      r1();
      await drainAll(releases.slice(1), [p2, p3]);
    } catch (e) {
      await drainAll(releases, [p1, p2, p3]);
      throw e;
    }
    await tick();
  });
});
