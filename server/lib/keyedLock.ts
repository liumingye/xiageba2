/**
 * 进程内「按 Key 串行」锁。
 *
 * 适用场景：把「先检查、再写入」这类非原子序列收敛成串行执行，避免两个并发
 * 请求同时通过检查、各自写入（典型受害者：改名前判断目标文件名是否被占用）。
 *
 * 局限（必须知道）：
 * - 只在单进程内有效。多副本 / 多进程部署时锁形同不存在，必须由数据库唯一约束
 *   兜底（StorageFile 的 (configId, path) WHERE isDeleted = false 部分唯一索引）。
 * - 不可重入。同一个 key 在处理函数内部再次调用 withKeyLock 会等到超时。
 *
 * 本模块刻意不 import h3 或任何别的东西：`server/lib/**` 的模块要能被 vitest
 * 直接解析（h3 不在根 node_modules 里，import 会失败）。
 */

/** 唯一键 → 当前链尾的 Promise */
const tails = new Map<string, Promise<void>>();

export interface KeyLockOptions {
  /**
   * 等待上限（毫秒）。超时抛 KeyLockTimeoutError，调用方应转成 409/503。
   * 传 0 或负数表示无限等待（不推荐，持有者挂死时会永久排队）。
   */
  waitMs?: number;
}

/** 等待超时：语义是「资源正被占用」，不是服务端故障 */
export class KeyLockTimeoutError extends Error {
  override readonly name = "KeyLockTimeoutError";
  /** 让 h3 的错误处理直接按 409 回应，无需调用方二次转换 */
  readonly statusCode = 409;
  readonly code = "ELOCKTIMEOUT";

  constructor(
    readonly key: string,
    readonly waitMs: number,
  ) {
    super(`资源正在被占用：${key}（等待 ${waitMs}ms 仍未释放）`);
  }
}

/**
 * 在指定 key 上独占执行 fn。
 *
 * 排队顺序严格按调用顺序；fn 抛错同样会释放锁，不会把后来者卡死。
 */
export async function withKeyLock<T>(
  key: string,
  fn: () => Promise<T>,
  options: KeyLockOptions = {},
): Promise<T> {
  const waitMs = options.waitMs ?? 30_000;
  const previous = tails.get(key) ?? Promise.resolve();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // 本持有者在链上的位置：前一个结束 → 兑现自己的 gate，后来者排在它之后
  const mine = previous.then(() => gate);
  tails.set(key, mine);

  const acquired = await waitFor(previous, waitMs);
  if (!acquired) {
    // 放弃等待时必须立刻兑现自己的 gate：否则排在后面的请求会挂在一个
    // 永远不会执行完的 promise 上，锁链整体僵死。
    release();
    if (tails.get(key) === mine) tails.delete(key);
    throw new KeyLockTimeoutError(key, waitMs);
  }

  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === mine) tails.delete(key);
  }
}

/** 等 promise 结束，最多等 waitMs；返回是否等到 */
function waitFor(promise: Promise<void>, waitMs: number): Promise<boolean> {
  if (!(waitMs > 0)) return promise.then(() => true);

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), waitMs);
    // 不因为这个纯等待定时器拖住进程退出
    (timer as unknown as { unref?: () => void }).unref?.();
    promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** 仅供测试：清空所有未释放的锁（不要在业务代码里调用） */
export function __resetKeyLocks() {
  tails.clear();
}
