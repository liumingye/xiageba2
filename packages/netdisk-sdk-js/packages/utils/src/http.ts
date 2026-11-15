import { StringUtil } from "./string"

export namespace ContentType {
    export const FormUrlencoded = "application/x-www-form-urlencoded;charset=UTF-8"
    export const JSON = "application/json;charset=UTF-8"
    export const Stream = "application/octet-stream"
    export const FormData = "multipart/form-data;charset=UTF-8"
}

export enum Method {
    GET = "GET",
    HEAD = "HEAD",
    POST = "POST",
    PUT = 'PUT',
    DELETE = 'DELETE',
    CONNECT = 'CONNECT',
    OPTIONS = 'OPTIONS',
    TRACE = 'TRACE',
    PATCH = 'PATCH'
}

export namespace CookieUtil {
    export const cookieToArray = (cookies: string): [key: string, value: string][] => {
        const result: [string, string][] = []
        for (const segment of cookies.split(';')) {
            const [key, ...rest] = StringUtil.splitN(segment.trim(), '=', 2)
            if (!key) continue
            result.push([key, (rest[0] ?? '').trim()])
        }
        return result
    }
    export const cookieToMap = (cookies: string) => new Map(cookieToArray(cookies))
    /** 合并 cookie，同名键以新值覆盖；输出用 '; ' 分隔（HTTP 规范格式） */
    export const mergeCookie = (orgCookies: string, ...newCookies: string[]) => {
        const merged = cookieToMap(orgCookies)
        for (const cookie of newCookies) {
            for (const [key, value] of cookieToArray(cookie)) {
                merged.set(key, value)
            }
        }
        return Array.from(merged, ([key, value]) => `${key}=${value}`).join('; ')
    }
}