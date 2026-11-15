/** superagent Response 的最小结构，避免 utils 依赖 superagent */
export interface IResponseLike {
    status: number
    body?: any
    text?: string
}

/** SError 派生类的最小结构 */
export interface IErrorFactory {
    create(tmpl: string, ctx?: any): Error
}

/** body 为字符串时尝试 JSON 解析，失败则原样返回 */
export const parseJsonBody = (body: any, text?: string): any => {
    const raw = body || text
    if (typeof raw !== 'string') return body
    try {
        return JSON.parse(raw)
    } catch {
        return body
    }
}

/** 按 keys 顺序，从 payload 顶层及其 data 字段中取第一个非空字符串消息 */
export const extractMessage = (payload: any, keys: readonly string[]): string => {
    if (payload == null || typeof payload !== 'object') return ''
    const scopes = [payload]
    if (payload.data != null && typeof payload.data === 'object') scopes.push(payload.data)
    for (const scope of scopes) {
        for (const key of keys) {
            const value = scope[key]
            if (typeof value === 'string' && value.trim() !== '') return value.trim()
        }
    }
    return ''
}

export interface IThrowErrorOption {
    /**
     * 业务层判定。返回 true 表示已识别且成功（直接放行）；
     * 返回 falsy 表示未识别，继续走 HTTP 状态判定；失败应自行抛错。
     */
    inspect?: (body: any) => boolean | void
    HttpError: IErrorFactory
    /** 提供时 401 抛 AuthError 而非 HttpError */
    AuthError?: IErrorFactory
    /** AuthError 消息模板，需含 {status} 占位 */
    authMessage?: string
}

/**
 * 生成 superagent 的 `.ok()` 判定函数。
 *
 * 各网盘的业务码规则不同（errno / code / error_code / 无统一码），
 * 由 inspect 注入；此处只收敛「解析 body → 业务判定 → HTTP 状态兜底」的骨架。
 */
export const createThrowError = (option: IThrowErrorOption) => {
    const { inspect, HttpError, AuthError, authMessage = 'auth error, status={status}' } = option
    return ({ body, status, text }: IResponseLike): boolean => {
        const parsed = parseJsonBody(body, text)
        if (inspect?.(parsed)) return true
        if (status >= 400) {
            if (status === 401 && AuthError) {
                throw AuthError.create(authMessage, { status })
            }
            throw HttpError.create('http request error, status={status}', { status })
        }
        return true
    }
}