import { ContentType, Method, NBoolean } from "@netdisk-sdk/utils";
import { BaiduClient } from "./client"
import { FileCategory, IFile, ResultInfo } from "./types";
import { ProgressEvent, Request } from 'superagent';
import { BufferSource, ReadableStream } from "stream/web";

export class BaiduFSApi {
    client: BaiduClient
    prefix: string

    constructor(client: BaiduClient, prefix?: string) {
        this.client = client
        this.prefix = prefix ?? 'https://pan.baidu.com'
    }

    request(method: Method, url: string) {
        const md = method.toLowerCase();
        if (url.startsWith('/')) url = this.prefix + url
        const request = (this.client.agentApi as any)[md](url) as Request
        return request.query({ app_id: 250528, channel: 'chunlei', web: 1 })
    }

    /**
     * 
     */

    gettemplatevariable<T extends string>(k: T[]): Promise<Record<T, unknown>> { throw '' }

    /** 下载地址获取 */
    filemetas(param: IFileMetasParam, ua?: string): Promise<IFileMetasResult> { throw '' }
    list(param: IListParam): Promise<IListResult> { throw '' }
    /** 查询文件列表 */
    listall(param: IListParam<IListAllExtend>): Promise<IListResult> { throw '' }
    /** 管理文件 */
    filemanager<Op extends IFileManagerOpera>(opera: Op, param: IFileManagerParam<IFileManagerFileListTypeMap[Op]>): Promise<IFileManagerResult> { throw '' }

    /************
     * 上传部分
     ***********/
    /** 预上传 */
    precreate(param: IPrecreateFileParam): Promise<IPrecreateFileResult> { throw '' }
    /** 秒传  */
    // rapidupload(){ throw '' }
    /** 上传完毕创建文件 */
    create(param: ICreateFileParam | ICreateDirParam): Promise<IFile> { throw '' }
    /** 上传分片 */
    updatePart(param: IUpdateParam, file: Blob | BufferSource | ReadableStream, progress: (event: ProgressEvent) => void, serverUrl?: string): Promise<IUpdateResult> { throw '' }

    /*********
     * 回收站
     ********/
    recycleList(param: IRecycleListParam): Promise<IRecycleListResult> { throw '' }
    recycleDelete(param?: IRecycleParam, ...fidlist: number[]): Promise<IRecycleResult> { throw '' }
    recycleClear(param?: IRecycleParam): Promise<IRecycleResult> { throw '' }
    recycleRestore(param?: IRecycleParam, ...fidlist: number[]): Promise<IRecycleResult> { throw '' }

    /** 查询异步任务进度 */
    taskquery(taskId: string): Promise<ITaskQueryResult> { throw '' }
}

BaiduFSApi.prototype.gettemplatevariable = async function (fields) {
    const { body: { result } } = await this.request(Method.GET, '/api/gettemplatevariable').query({
        fields: JSON.stringify(fields)
    })
    return result
}

export type IFileMetasParam<Extend = {}> = {
    /** 文件路径 */
    target: string[]
    /** 是否需要下载地址 */
    dlink?: NBoolean
    origin?: string
} & Extend;
export type IFileMeta<Extend = Record<string, any>> = {
    fs_id: number
    path: string

    /** 文件类型 */
    category: FileCategory;
    /** 文件下载地址 */
    dlink: string;
    /** 文件名 */
    server_filename: string;
    /** 是否是目录 */
    isdir: number;
    /** 文件的本地创建时间戳(秒) */
    local_ctime: number;
    /** 文件的本地修改时间戳(秒) */
    local_mtime: number;
    /** 文件的服务器创建时间戳(秒) */
    server_ctime: number;
    /** 文件的服务器修改时间戳(秒) */
    server_mtime: number;
    /** 文件大小（字节） */
    size: number;
} & Extend;
export type IFileMetasResult = ResultInfo<IFileMeta, {}>;
BaiduFSApi.prototype.filemetas = async function (param, ua = 'netdisk') {
    const target = JSON.stringify(param.target)
    const { body: filemetas } = await this.request(Method.GET, '/api/filemetas')
        .set({ 'user-agent': ua })
        .query({
            // web: "5",
            // origin: "dlna",
            ...param,
            target,
        })
    return filemetas
}

export type IPageParam = {
    page?: number,
    num?: number
}

export type IOffsetParam = {
    /** youth 使用偏移 */
    start?: number
    /** @default 1000 */
    limit?: number
}

export type IListAllExtend = {
    /**
        * 是否递归
        * @default 0
        */
    recursion?: NBoolean
    /** 用于时间范围筛选  */
    ctime?: number,
    /** 用于时间范围筛选  */
    mtime?: number
}

/** 注：youth 使用IOffsetParam */
export type IListParam<Extend = {}, Page = IPageParam & IOffsetParam> = Extend & Page & {
    dir: string
    /** 默认为文件类型 */
    order?: 'time' | 'name' | 'size'
    /** @default 0 */
    desc?: NBoolean
};
export type IListResult = {
    // has_more: NBoolean
    // cursor: number
    list: IFile[]
};
BaiduFSApi.prototype.list = async function (param) {
    const { body } = await this.request(Method.GET, '/api/list')
        .query({
            ...param,
        })
    return body
}
BaiduFSApi.prototype.listall = async function (param) {
    const { body } = await this.request(Method.GET, '/api/listall')
        .query({
            ...param,
        })
    return body
}

export type IFileManagerOpera = keyof IFileManagerFileListTypeMap
export type IFileManagerParam<FileList = any> = {
    /** 0 同步，1 自适应，2 异步 */
    async: 0 | 1 | 2
    /** 全局ondup,遇到重复文件的处理策略,
     * fail(默认，直接返回失败)、newcopy(重命名文件)、overwrite(覆盖文件)、skip（跳过文件）
     */
    ondup: 'fail' | 'newcopy' | 'overwrite' | 'skip'
    filelist: FileList
}
export type IFileManagerFileListTypeMap = {
    copy: { path: string, dest: string, newname: string }
    move: { path: string, dest: string, newname: string }
    rename: { path: string, newname: string }
    delete: { filelist: string[] }
}
export type IFileManagerResult = {
    taskid: number
    info: Record<string, any>[]
};
BaiduFSApi.prototype.filemanager = async function (opera, param) {
    // @ts-ignore
    if ('filelist' in param) param.filelist = JSON.stringify(param.filelist)
    const { body } = await this.request(Method.POST, '/api/filemanager').query({ opera })
        .type(ContentType.FormUrlencoded)
        .send(param)
    return body
}

export type IPrecreateFileParam = {
    path: string
    block_list: string[]
};
export type IPrecreateFileResult = {
    path: string
    uploadid: string
    return_type: number
    block_list: number[]
};
BaiduFSApi.prototype.precreate = async function (param) {
    const block_list = JSON.stringify(param.block_list || [])
    const { body } = await this.request(Method.POST, '/api/precreate')
        .type(ContentType.FormUrlencoded)
        .send({ autoinit: 1, ...param, block_list })
    return body
}

export type IUpdateParam = {
    path: string,
    uploadid: string,
    partseq: number
};
export type IUpdateResult = {
    md5: string
};
BaiduFSApi.prototype.updatePart = async function (param, file, progress, serverUrl = "https://c.pcs.baidu.com") {
    const { body } = await this.request(Method.POST, serverUrl + '/rest/2.0/pcs/superfile2')
        .query({
            method: 'upload',
            type: 'tmpfile',
            ...param
        })
        .on('progress', progress)
        .send(file)
    return body
}


export type ICreateFileParam = {
    path: string
    size: number
    isdir: 0
    block_list: string[]
    uploadid: string
    /**
     * 文件命名策略。
     * 1 表示当path冲突时，进行重命名
     * 2 表示当path冲突且block_list不同时，进行重命名
     * 3 当云端存在同名文件时，对该文件进行覆盖
     */
    rtype?: 0 | 1 | 2
    /** 客户端创建时间，默认为当前时间。 时间戳（秒） */
    local_ctime?: number
    /** 客户端修改时间，默认为当前时间。 时间戳（秒） */
    local_mtime?: number
}

export type ICreateDirParam = {
    path: string
    isdir: 1
    /** 
     * 文件命名策略，默认0
     * 0 为不重命名，返回冲突 
     * 1 为只要path冲突即重命名 
     */
    rtype?: 0 | 1

    /** 客户端创建时间，默认为当前时间。 时间戳（秒） */
    local_ctime?: number
    /** 客户端修改时间，默认为当前时间。 时间戳（秒） */
    local_mtime?: number
};
BaiduFSApi.prototype.create = async function (param) {
    const block_list = 'block_list' in param ? JSON.stringify(param.block_list || []) : void 0
    const { body } = await this.request(Method.POST, '/api/create')
        .type(ContentType.FormUrlencoded)
        .send({ ...param, block_list })
    return body
}

export type IRecycleListParam = {
    page: number
    num?: number
};
export type IRecycleListResult = {
    // has_more: NBoolean
    // cursor: number
    list: IFile[]
};
BaiduFSApi.prototype.recycleList = async function (param) {
    const { body } = await this.request(Method.GET, '/api/recycle/list').query({
        web: 1,
        ...param
    })
    return body
}

export type IRecycleParam = {
    /** 0 同步，1 自适应，2 异步 */
    async: 0 | 1 | 2
};
export type IRecycleResult = {
    taskid: number
};

BaiduFSApi.prototype.recycleClear = async function (param) {
    const { body } = await this.request(Method.POST, '/api/recycle/clear').query(param || {})
    return body
}
BaiduFSApi.prototype.recycleDelete = async function (param, ...fsids) {
    const fidlist = JSON.stringify(fsids.map(v => parseInt(v as any)))
    const { body } = await this.request(Method.POST, '/api/recycle/delete')
        .query(param || {})
        .type(ContentType.FormUrlencoded)
        .send({ fidlist })
    return body
}
BaiduFSApi.prototype.recycleRestore = async function (param, ...fsids) {
    const fidlist = JSON.stringify(fsids.map(v => parseInt(v as any)))
    const { body } = await this.request(Method.POST, '/api/recycle/restore')
        .query(param || {})
        .type(ContentType.FormUrlencoded)
        .send({ fidlist })
    return body
}

export type ITaskQueryResult = {
    mtime: number
    status: 'pending' | 'failed' | 'success'
    task_errno: number
    task_error: string
};
BaiduFSApi.prototype.taskquery = async function (taskid) {
    const { body } = await this.request(Method.GET, '/share/taskquery').query({ taskid })
    return body
}