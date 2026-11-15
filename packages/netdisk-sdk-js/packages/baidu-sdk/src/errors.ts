import { createThrowError } from "@netdisk-sdk/utils"
import { isIBaiduResult, isIBaiduResult2 } from "./types"
import { SError } from "error"

export { SError };

export class ApiError extends SError { }
/** http 请求错误 */
export class HttpError extends SError { }

/** 百度部分接口把 errno 下发成字符串 "0" */
const isSuccessCode = (code: unknown) => code === 0 || code === "0"

export const throwError = createThrowError({
    HttpError,
    inspect: (body) => {
        if (isIBaiduResult(body)) {
            if (isSuccessCode(body.errno)) return true
            throw ApiError.create(
                'code: {errno}, msg: {errmsg}, show_msg: {show_msg}, refer to https://pan.baidu.com/union/doc/',
                body,
            )
        }
        if (isIBaiduResult2(body)) {
            if (isSuccessCode(body.error_code)) return true
            throw ApiError.create(
                'code: {error_code}, msg: {error_msg}, refer to https://pan.baidu.com/union/doc/',
                body,
            )
        }
    },
})