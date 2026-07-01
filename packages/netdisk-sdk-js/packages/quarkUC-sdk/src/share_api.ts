import { QuarkUCClient } from "./client";
import { NBoolean } from "@netdisk-sdk/utils";
import { IFile, ICreateTaskResult, ISaveTaskStateResult, IFidExtend, getFileFid, IQueryPageParam, toSortStr, IQueryPageResult } from "./types";

export class QuarkUCShareApi {
    client: QuarkUCClient
    constructor(client: QuarkUCClient) {
        this.client = client
    }

    /**
     * 获取分享信息
     * @param pwd_id 分享ID
     * @param passcode 提取码
     */
    token(pwd_id: string, passcode?: string): Promise<IShareTokenResult> { throw '' }
    /**
     * 列出分享文件
     * @param pwd_id 分享ID 
     * @param stoken [self.token]方法获取的token 
     * @param params 
     */
    detail(pwd_id: string, stoken: string, params?: IQueryShareParam): Promise<IShareDetailResult> { throw '' }

    /**
     * 获取用于转存分享的目录信息
     */
    dir(): Promise<IFile> { throw '' }
    /**
     * 转存分享
     * @returns { TaskID }
     */
    save(pwd_id: string, stoken: string, saveDir: IFidExtend, fileList: Pick<IShareFile, 'fid' | 'share_fid_token'>[]): Promise<ICreateTaskResult> { throw '' }

    /**
     * 查询转存分享状态
     * @param taskID 
     * @param await 
     */
    saveTask(taskID: string, _await?: boolean): Promise<ISaveTaskStateResult> { throw '' }
}

export interface IShareTokenResult {
    title: string
    subscribed: boolean,
    stoken: string,
    share_type: number,
    expired_type: number,
    /** 过期时间，时间戳ms */
    expired_at: number,
    author: {
        /** 昵称 */
        nick_name: string
        /** 头像地址 */
        avatar_url: string,
        /** vip类型 */
        member_type: string,
    },
}

QuarkUCShareApi.prototype.token = async function (pwd_id, passcode) {
    const { body: { data } } = await this.client.agentApi
        .post('/share/sharepage/token')
        .send({ pwd_id, passcode })
    return data
}

export type IQueryShareParam = Partial<IQueryPageParam<{
    pdir_fid: string
    force: NBoolean
    _fetch_banner: NBoolean
    _fetch_share: NBoolean
}, 'file_type' | 'updated_at'>>

export type IShareDetailResult = IQueryPageResult<IShareFile>;
export interface IShareFile extends IFile {
    share_fid_token: string
}
QuarkUCShareApi.prototype.detail = async function (pwd_id, stoken, params = {}) {
    params = {
        pdir_fid: '0',
        force: 0,
        _fetch_banner: 0, _fetch_share: 0,
        _page: 1,
        _size: 50,
        _sort: [['file_type', 'asc'], ['updated_at', 'desc']],
        ...params,
    }
    // @ts-ignore
    params._sort = toSortStr(params._sort)
    const { body: { data: { list }, metadata } } = await this.client.agentApi
        .get('/share/sharepage/detail')
        .query({
            ...params,
            pwd_id, stoken,
            _fetch_total: 1
        })

    return {
        list,
        ...metadata
    }
}

QuarkUCShareApi.prototype.dir = async function () {
    const { body: { data: { dir } } } = await this.client.agentApi.get('/share/sharepage/dir')
    return dir
}

QuarkUCShareApi.prototype.save = async function (pwd_id, stoken, saveDir, fileList) {
    const [fid_list, fid_token_list] = fileList.map(file => [[file.fid], [file.share_fid_token]]).flat(1)
    const to_pdir_fid = getFileFid(saveDir)
    const { body: { data } } = await this.client.agentApi
        .post('/share/sharepage/save')
        .send({
            scene: "link",
            pdir_fid: "0",
            pwd_id, stoken,
            fid_list, fid_token_list,
            to_pdir_fid
        })
    return data
}

QuarkUCShareApi.prototype.saveTask = function (taskID, _await) {
    return this.client.fsApi.task(taskID, _await)
}