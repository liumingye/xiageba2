import { Check } from "@netdisk-sdk/utils"
import { isIBaiduResult, isIBaiduResult2 } from "./types"
import { SError } from "error"
import { Response } from "superagent";

export class ApiError extends SError { }
/** http 请求错误 */
export class HttpError extends SError { }

export const throwError = ({ body, status, text }: Response) => {
    if (Check.isString(body || text)) try { body = JSON.parse(body || text) } catch (error) { }
    if (isIBaiduResult(body)) {
        const errorTmpl = 'code: {errno}, msg: {errmsg}, show_msg: {show_msg}, refer to https://pan.baidu.com/union/doc/'
        switch (body.errno) {
            case 0: return true
            default: throw ApiError.create(errorTmpl, body)
        }
    }else if(isIBaiduResult2(body)){
         const errorTmpl = 'code: {error_code}, msg: {error_msg}, refer to https://pan.baidu.com/union/doc/'
         switch (body.error_code) {
            case 0: return true
            default: throw ApiError.create(errorTmpl, body)
        }
    }
    if (status >= 400) throw HttpError.create('http request error, status={status}', { status })
    return true
}