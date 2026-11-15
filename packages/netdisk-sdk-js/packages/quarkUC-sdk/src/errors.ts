import { createThrowError } from "@netdisk-sdk/utils"
import { isIQuarkUCApiResult } from "./types"
import { SError } from "error"

export class ApiError extends SError { }
/** http 请求错误 */
export class HttpError extends SError { }

export const throwError = createThrowError({
    HttpError,
    inspect: (body) => {
        if (!isIQuarkUCApiResult(body)) return
        if (body.code === 0) return true
        throw ApiError.create('code: {code}, msg: {message}', body)
    },
})