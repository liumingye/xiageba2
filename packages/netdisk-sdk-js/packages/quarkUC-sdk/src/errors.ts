import { Check } from "@netdisk-sdk/utils"
import { isIQuarkUCApiResult } from "./types"
import { SError } from "error"
import { Response } from "superagent";

export class ApiError extends SError { }
/** http 请求错误 */
export class HttpError extends SError { }

export const throwError = ({ body, status, text }: Response) => {
    if (Check.isString(body || text)) try { body = JSON.parse(body || text) } catch (error) { }
    if (isIQuarkUCApiResult(body)) {
        const errorTmpl = 'code: {code}, msg: {message}'
        switch (body.code) {
            case 0: return true
            default: throw ApiError.create(errorTmpl, body)
        }
    }
    if (status >= 400) throw HttpError.create('http request error, status={status}', { status })
    return true
}