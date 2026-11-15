import { AsyncUtil } from "./async"
import { type Await } from "./types"

export interface IPollOption<T> {
    /** 判定任务完成 */
    isDone: (result: T) => boolean
    /** 判定任务失败（提供时命中即立刻抛错，不再空转到超时） */
    isFailed?: (result: T) => boolean
    /** 轮询间隔 @default 1000 */
    intervalMs?: number
    /** 最大轮询次数，0 表示不轮询直接超时 @default 30 */
    maxAttempts?: number
    /** 超时错误；last 为最后一次响应，便于错误携带原始 body */
    timeoutError: (last: T | undefined, attempts: number) => Error
    /** 失败错误 */
    failedError?: (result: T) => Error
}

/**
 * 轮询异步任务直到完成 / 失败 / 超时。
 *
 * 统一各网盘 waitTask 的行为：有次数上限、命中失败立即退出、
 * 最后一次尝试后不再多睡一个间隔。
 */
export const pollTask = async <T>(
    fetch: (attempt: number) => Await<T>,
    option: IPollOption<T>,
): Promise<T> => {
    const {
        isDone,
        isFailed,
        intervalMs = 1000,
        maxAttempts = 30,
        timeoutError,
        failedError,
    } = option
    // 与各 SDK 原 for 循环一致：0/负数直接超时。不提供「不限制」，避免请求永久挂起
    const limit = Math.max(0, Math.floor(maxAttempts))

    let last: T | undefined
    for (let attempt = 0; attempt < limit; attempt++) {
        last = await fetch(attempt)
        if (isFailed?.(last)) {
            throw failedError?.(last) ?? timeoutError(last, attempt + 1)
        }
        if (isDone(last)) return last
        if (attempt < limit - 1) await AsyncUtil.sleep(intervalMs)
    }

    throw timeoutError(last, limit)
}