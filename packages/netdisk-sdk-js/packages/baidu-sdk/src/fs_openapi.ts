import { ContentType, Method, NBoolean, StringNumber } from "@netdisk-sdk/utils"
import { BaiduClient } from "./client"
import { BufferSource, ReadableStream } from "stream/web"
import { ProgressEvent, Request } from 'superagent';
import { FileCategory, IFile, ResultList } from "./types";

export class BaiduFSOpenApi {
    prefix = "https://pan.baidu.com"
    client: BaiduClient

    constructor(client: BaiduClient) {
        this.client = client
    }
    request(method: Method, url: string) {
        const md = method.toLowerCase();
        if (url.startsWith('/')) url = this.prefix + url
        const request = (this.client.agentApi as any)[md](url) as Request
        return request
    }

    /** 用户信息 */
    userInfo(): Promise<IOpenApiUserInfo> { throw '' }
    /** 容量信息 */
    quota(): Promise<IOpnApiQuota> { throw '' }
    xpanfile<Query extends object, Data extends object, Result>(method: string, query: Query, data: Data): Promise<Result> { throw '' }
    xpanmultimedia<Query extends object, Result>(method: string, query: Query): Promise<Result> { throw '' }

    /** 管理文件 */
    filemanager<Op extends IOpenApiFileManagerOpera>(opera: Op, param: IOpenApiFileManagerParam<IOpenApiFileManagerFileListTypeMap[Op]>): Promise<IOpenApiFileManagerResult> { throw '' }
    /** 查询文件列表 */
    listall(param: IOpenApiListParam): Promise<IOpenApiListResult> { throw '' }
    /** 查询文件信息，包括下载地址 */
    filemetas(param: IOpenApiFileMetasParam): Promise<IOpenApiFileMetasResult> { throw '' }

    /************
     * 上传部分
     ***********/

    /** 上传域名服务器查询 */
    locateupload(path: string, uploadid: string): Promise<IOpenApiLocateUploadResult> { throw '' }

    /** 预上传 */
    precreate(param: IOpenApiPrecreateFileParam): Promise<IOpenApiPrecreateFileResult> { throw '' }
    /** 上传完毕创建文件 */
    create(param: IOpenApiCreateFileParam | IOpenApiCreateDirParam): Promise<IFile> { throw '' }
    /** 上传分片 */
    updatePart(param: IOpenApiUpdateParam, file: Blob | BufferSource | ReadableStream, progress: (event: ProgressEvent) => void, serverUrl?: string): Promise<IOpenApiUpdateResult> { throw '' }
}

export type IOpenApiUserInfo = {
    avatar_url: string,
    /** 用户账号名称 */
    baidu_name: string,
    /** 网盘账号名称 */
    netdisk_name: string,
    /** 用户ID */
    uk: number,
    /** 会员类型，0普通用户、1普通会员、2超级会员 */
    vip_type: number
};
BaiduFSOpenApi.prototype.userInfo = async function () {
    const { body: userinfo } = await this.request(Method.GET, '/rest/2.0/xpan/nas').query({ method: "uinfo" })
    return userinfo
}

export type IOpnApiQuota = {
    /** 总空间大小，单位B */
    total: number
    /** 已使用大小，单位B */
    used: number
    /** 免费容量，单位B */
    free: number
    /** 7天内是否有容量到期 */
    expire: boolean
};
BaiduFSOpenApi.prototype.quota = async function () {
    const { body: userinfo } = await this.request(Method.GET, '/api/quota').query({ checkfree: "1", checkexpire: "1" })
    return userinfo
}

BaiduFSOpenApi.prototype.xpanfile = async function (method, query, data) {
    const { body } = await this.request(Method.POST, '/rest/2.0/xpan/file')
        .type(ContentType.FormUrlencoded)
        .query({ method, ...query })
        .send(data)
    return body
}
BaiduFSOpenApi.prototype.xpanmultimedia = async function (method, query) {
    const { body } = await this.request(Method.POST, '/rest/2.0/xpan/multimedia')
        .type(ContentType.FormUrlencoded)
        .query({ method, ...query })
        .send()
    return body
}

export type IOpenApiFileManagerOpera = keyof IOpenApiFileManagerFileListTypeMap
export type IOpenApiFileManagerParam<FileList = any> = {
    /** 0 同步，1 自适应，2 异步 */
    async: 0 | 1 | 2
    /** 全局ondup,遇到重复文件的处理策略,
     * fail(默认，直接返回失败)、newcopy(重命名文件)、overwrite(覆盖文件)、skip（跳过文件）
     */
    ondup: 'fail' | 'newcopy' | 'overwrite' | 'skip'
    filelist: FileList
}
export type IOpenApiFileManagerFileListTypeMap = {
    copy: { path: string, dest: string, newname: string }
    move: { path: string, dest: string, newname: string }
    rename: { path: string, newname: string }
    delete: { filelist: string[] }
}
export type IOpenApiFileManagerResult = {
    taskid: number
    info: Record<string, any>[]
};
BaiduFSOpenApi.prototype.filemanager = async function (opera, param) {
    // @ts-ignore
    if ('filelist' in param) param.filelist = JSON.stringify(param.filelist)
    return await this.xpanfile('filemanager', { opera }, param)
}

export type IOpenApiLocateUploadResult<Server = { server: string }> = {
    client_ip: string,
    expire: number,
    host: string,
    newno: string,
    /** 时间戳（秒） */
    server_time: number,
    sl: number

    bak_server: any,
    bak_servers: Server[],

    quic_server: any,
    quic_servers: Server[],

    server: any,
    servers: Server[],
};
BaiduFSOpenApi.prototype.locateupload = async function (path, uploadid) {
    const { body } = await this.request(Method.POST, '/rest/2.0/pcs/file').query({
        method: 'locateupload',
        appid: 250528,
        upload_version: '2.0',
        path,
        uploadid,
    })
    return body
}

export type IOpenApiPrecreateFileParam = {
    path: string,
    size: string
    isdir: 0,
    block_list: string[]
    autoinit: 1,
    /**
    * 文件命名策略。
    * 1 表示当path冲突时，进行重命名
    * 2 表示当path冲突且block_list不同时，进行重命名
    * 3 当云端存在同名文件时，对该文件进行覆盖
    */
    rtype?: 0 | 1 | 2
};
export type IOpenApiPrecreateFileResult = {
    path: string
    uploadid: string
    return_type: number
    block_list: number[]
};
BaiduFSOpenApi.prototype.precreate = async function (param) {
    const block_list = JSON.stringify(param.block_list || [])
    return await this.xpanfile('precreate', {}, { ...param, block_list })
}

export type IOpenApiCreateFileParam = {
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
    /**
     * 是否需要多版本支持
     * 1为支持，0为不支持， 默认为0 (带此参数会忽略重命名策略)
     */
    is_revision?: NBoolean
    /**
    * 上传方式
    * 1 手动、2 批量上传、3 文件自动备份4 相册自动备份、5 视频自动备份
    */
    mode?: number
    /**
     * 图片压缩程度，有效值50、70、100（带此参数时，zip_sign 参数需要一并带上）
     */
    zip_quality?: 50 | 70 | 100
    /**
     * 未压缩原始图片文件真实md5（带此参数时，zip_quality 参数需要一并带上）
     */
    zip_sign?: string
    /**
     * 图片扩展信息
     */
    exif_info?: {
        orientation: string
        width: string
        height: string
        recovery: string

        model?: string

        /** 2018:09:06 15:58:58 同下 */
        date_time_original?: string
        date_time_digitized?: string
        date_time?: string
    }
}

export type IOpenApiCreateDirParam = {
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
    /**
     * 上传方式
     * 1 手动、2 批量上传、3 文件自动备份4 相册自动备份、5 视频自动备份
     */
    mode?: number
};
BaiduFSOpenApi.prototype.create = async function (param) {
    const block_list = 'block_list' in param ? JSON.stringify(param.block_list || []) : void 0
    return await this.xpanfile('create', {}, { ...param, block_list })
}

export type IOpenApiUpdateParam = {
    path: string,
    uploadid: string,
    partseq: number
};
export type IOpenApiUpdateResult = {
    md5: string
};
BaiduFSOpenApi.prototype.updatePart = async function (param, file, progress, serverUrl = "https://c.pcs.baidu.com") {
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

export type IOpenApiListParam = {
    path: string
    /**
     * 是否递归
     * @default 0
     */
    recursion?: NBoolean
    /** 默认为文件类型 */
    order?: 'time' | 'name' | 'size'
    /** @default 0 */
    desc?: NBoolean
    start: number,
    /** @default 1000 */
    limit?: number
    ctime?: number, mtime?: number
};
export type IOpenApiListResult = {
    has_more: NBoolean
    cursor: number
    list: IFile[]
};
BaiduFSOpenApi.prototype.listall = async function (param,) {
    return await this.xpanmultimedia('listall', {
        web: 1,
        ...param,
    })
}

export type IOpenApiFileMetasParam = {
    fsids: StringNumber[]
    /**
     * 查询共享目录或专属空间内文件时需要。
     * 共享目录格式： /uk-fsid
     * 其中uk为共享目录创建者id， fsid对应共享目录的fsid
     * 专属空间格式：/_pcs_.appdata/xpan/
     */
    path?: string
    /** 是否需要下载地址 */
    dlink?: NBoolean
    /** 是否需要缩略图地址 */
    thumb?: NBoolean
    /** 图片是否需要拍摄时间、原图分辨率等其他信息 */
    extra?: NBoolean
    /** 视频是否需要展示时长信息 */
    needmedia?: NBoolean
    /** 视频是否需要展示长，宽等信息 */
    detail?: NBoolean
};
export type IOpenApiFileMeta = {
    fs_id: number
    path: string
    /** 文件类型 */
    category: FileCategory;
    /** 文件下载地址 */
    dlink: string;
    /** 文件名 */
    filename: string;
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
    /** 缩略图地址， */
    thumbs?: Record<string, string>[];

    height?: number;
    width?: number;
    /** 图片拍摄时间 */
    date_taken?: number;
    /** 图片旋转方向信息 */
    orientation?: string;
};
export type IOpenApiFileMetasResult = ResultList<IOpenApiFileMeta, {
    /** 如果查询共享目录，该字段为共享目录文件上传者的uk和账户名称 */
    names: any
}>;
BaiduFSOpenApi.prototype.filemetas = async function (param) {
    const fsids = JSON.stringify(param.fsids.map(v => parseInt(v as any)))
    return await this.xpanmultimedia('filemetas', { ...param, fsids })
}