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
    export const cookieToArray = (cookies: string) => cookies.split(';').map(cookie => StringUtil.splitN(cookie, '=', 2) as [key: string, value: string])
    export const cookieToMap = (cookies: string) => new Map(cookieToArray(cookies))
    export const mergeCookie = (orgCookies: string, ...newCookies: string[]) => {
        const oldCookie = cookieToMap(orgCookies)
        for (const cookie of newCookies) {
            const cookies = cookieToArray(cookie)
            for (const [key, value] of cookies) {
                oldCookie.set(key, value)
            }
        }
        return Array.from(oldCookie.entries()).map(cookie => cookie.join('=')).join(';')
    }
}