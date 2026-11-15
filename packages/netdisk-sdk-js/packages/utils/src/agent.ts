/** 各网盘 SDK 统一的 keep-alive 连接池参数 */
export const KEEP_ALIVE_OPTIONS = {
    maxSockets: 100,
    maxFreeSockets: 10,
    /** active socket keepalive 60s */
    timeout: 60000,
    /** free socket keepalive 30s */
    freeSocketTimeout: 30000,
} as const

/** 各网盘 SDK 统一的单请求超时（ms） */
export const REQUEST_TIMEOUT = 15000

/**
 * 可安全重放的 HTTP 方法。
 * POST/PATCH 被排除：网盘的转存、建分享、删除都是 POST，
 * 重放会产生重复副本 / 重复分享链接。
 */
export const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
    'GET', 'HEAD', 'OPTIONS', 'TRACE', 'PUT', 'DELETE',
])

/** superagent Request 的最小结构，避免 utils 依赖 superagent */
interface IRetryableRequest {
    method?: string
    retry(count: number, callback?: (err: unknown, res: unknown) => boolean | undefined): unknown
}

/**
 * 只对幂等方法启用重试的 superagent 插件。
 *
 * superagent 10.x 的 `_shouldRetry` 把方法白名单注释掉了，裸 `.retry(3)`
 * 会在 408/429/5xx/超时/ECONNRESET 时重放 POST。用回调显式拦掉非幂等方法，
 * 返回 undefined 时仍沿用 superagent 默认的状态码/错误码判定。
 */
export const idempotentRetry = (maxRetries = 3) => (request: IRetryableRequest) => {
    request.retry(maxRetries, () =>
        IDEMPOTENT_METHODS.has(String(request.method ?? '').toUpperCase()) ? undefined : false,
    )
}