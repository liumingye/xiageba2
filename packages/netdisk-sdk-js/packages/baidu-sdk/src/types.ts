import { Check, NBoolean } from "@netdisk-sdk/utils"

export type IBaiduResult<Extend = {}> = {
    errno: number | 0
    errmsg?: string

    request_id?: number | string

    show_msg?: string
} & Extend

export const isIBaiduResult = (o: any): o is IBaiduResult => {
    return Check.isObject(o) && 'errno' in o
}

export type IBaiduResult2<Extend = {}> = {
    error_code: number | 0
    error_msg?: string

    request_id: number | string
} & Extend

export const isIBaiduResult2 = (o: any): o is IBaiduResult2 => {
    return Check.isObject(o) && 'error_code' in o && 'error_msg' in o
}

export type ResultList<T = any, Extend = {}> = {
    list: T[]
} & Extend
export type ResultInfo<T = any, Extend = {}> = {
    info: T[]
} & Extend

export interface IFile {
    fs_id: number
    server_filename: string
    isdir: NBoolean
    path: string
    size: number
    md5: string

    /** 创建数据， 时间戳（秒） */
    ctime?: number; local_ctime?: number; server_ctime?: number
    /** 修改数据， 时间戳（秒） */
    mtime?: number; local_mtime?: number; server_mtime?: number

    category: FileCategory
    thumbs?: Record<string, string>[]
}

/** 分类类型, 1 视频 2 音频 3 图片 4 文档 5 应用 6 其他 7 种子 */
export type FileCategory = number | 1 | 2 | 3 | 4 | 5 | 6 | 7