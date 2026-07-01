import { ArrayUtil, Check, NBoolean } from "@netdisk-sdk/utils"

export type IQuarkUCApiResult<T = never, Extend = {}> = {
    status: number | 200,
    code: number | 0,
    message: string | 'ok',
    timestamp: number,
    data: T
} & Extend

export const isIQuarkUCApiResult = (o: any): o is IQuarkUCApiResult => {
    return Check.isObject(o) && 'code' in o && 'message' in o
}

export type ICreateTaskResult = {
    task_id: string
}

export type ITaskStateResult<Extend = {}> = {
    task_id: string
    /** 0:进行中 2: 完成 */
    status: number
    /** 创建时间 时间戳ms */
    created_at: number
    /**  完成时间 */
    finished_at?: number

    event_id: string
    task_title: string
    /** 17:分享转存 */
    task_type: number
} & Extend

export type ISaveTaskStateResult = ITaskStateResult<{
    save_as: {
        save_as_top_fids: string[]
        to_pdir_fid: string
    }
}>

export interface IFile {
    fid: string
    pdir_fid: string
    size: number
    file_name: string
    // file: boolean, dir: boolean, 
    /** 0:文件夹 1:文件 */
    file_type: NBoolean
    /** 1:视频 3:图片 4:文档 6:压缩包 */
    category: number
    /** 文件mime信息 */
    format_type: string
    /** 时间戳 ms */
    created_at: number
    updated_at: number
    operated_at?: number

    thumbnail?: string
    big_thumbnail?: string
}

export type IFileFid = Pick<IFile, 'fid'>
export type IFidExtend = IFileFid | string
export const getFileFid = (file: IFidExtend) => {
    return typeof file == 'string' ? file : file.fid
}

export type ISort<Filed extends string, Order extends string = 'asc' | 'desc'> = `${Filed}:${Order}` | [Filed] | [Filed, Order]
export const toSortStr = <T extends ISort<string, string>>(sorts?: T | T[]) => {
    return sorts && ArrayUtil.toArray(sorts).map(v => Check.isArray(v) ? `${v[0]}:${v[1] ?? 'asc'}` : v).join(',')
}

export type IQueryPageParam<Extend = {}, SortFiled extends string = string, Sort = ISort<SortFiled>> = {
    _page: number
    _size: number
    _sort: Sort | Sort[]
} & Extend

export type IQueryPageResult<Data> = {
    list: Data[]
    _count: number
    _page: number
    _size: number
    _total: number
}