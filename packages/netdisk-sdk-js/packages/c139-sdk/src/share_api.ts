import { C139Client } from "./client";
import {
  C139_SHARE_GENERAL_URL,
  C139_SHARE_LIST_URL,
  C139_SHARE_LINK_URL,
  C139_TRANSFER_CREATE_URL,
  C139_TRANSFER_QUERY_URL,
  C139_CREATE_SHARE_URL,
  C139_TASK_POLL_INTERVAL,
  C139_TASK_POLL_MAX,
} from "./const";
import { isC139Success, raiseApiError, ApiError } from "./errors";
import {
  IC139DownloadLink,
  IC139File,
  IC139ParsedShareURL,
  IC139ShareDownloadParam,
  IC139ShareFilesParam,
  IC139ShareFilesResult,
  IC139TransferParam,
  IC139TransferResult,
} from "./types";

/** 判断是否 139 网盘链接 */
export const isC139URL = (rawURL: string): boolean => {
  try {
    const trimmed = rawURL.trim();
    const urlObj = new URL(trimmed);
    const host = urlObj.hostname.toLowerCase();
    // 精确匹配主域名，支持caiyun.139.com
    return host === "yun.139.com" || host.endsWith("yun.139.com");
  } catch {
    // 不是合法URL直接返回false
    return false;
  }
};

/**
 * 从 139 分享链接解析 linkId 与提取码
 * 支持模式：
 *   - 不带密码: https://yun.139.com/shareweb/#/w/i/2ygBjP7ptdnpr
 *   - 带密码:   https://yun.139.com/shareweb/#/w/i/2ygBjP7ptdnpr&agyn
 *   - 带密码:   https://yun.139.com/shareweb/#/w/i/2ygBjP7ptdnpr&pwd=agyn
 *   - 带密码:   https://yun.139.com/shareweb/#/w/i/2ygBjP7ptdnpr&123agyn
 *
 * 密码规则：linkId 后若有 &，取 & 后的部分；
 *   若为 pwd=xxx 则取 xxx，否则取末尾 4 位数字字母。
 */
export const parseC139ShareURL = (rawURL: string): IC139ParsedShareURL => {
  let linkId = "";
  let passcode = "";

  // 提取 #/w/i/ 之后到 ? 或 # 或末尾的部分
  const hashMatch = rawURL.match(/w\/i\/([^?#]+)/i);
  if (hashMatch && hashMatch[1]) {
    const fragment = hashMatch[1];
    const ampIdx = fragment.indexOf("&");
    if (ampIdx === -1) {
      // 无 &，整体为 linkId
      linkId = fragment;
    } else {
      linkId = fragment.slice(0, ampIdx);
      const pwdStr = fragment.slice(ampIdx + 1);
      // pwd=xxx 格式
      const pwdMatch = pwdStr.match(/^pwd=(.+)/i);
      if (pwdMatch) {
        passcode = pwdMatch[1].trim();
      } else {
        // 取末尾 4 位数字字母
        const alnum = pwdStr.replace(/[^a-zA-Z0-9]/g, "");
        passcode = alnum.slice(-4);
      }
    }
  }
  return { linkId, passcode };
};

/** 解析分享响应中的文件条目（caLst 目录 + coLst 文件） */
const parseShareFile = (
  item: Record<string, any>,
  parentId: string,
  isDir: boolean,
): IC139File => {
  const fid = String(item[isDir ? "caID" : "coID"] || "");
  const fileName = String(item[isDir ? "caName" : "coName"] || "");
  const size = isDir ? 0 : Number(item["coSize"] || 0);
  const modifyTime = String(item["udTime"] || item["ctTime"] || "");
  return { fid, fileName, isDir, size, parentId, modifyTime, raw: item };
};

export class C139ShareApi {
  client: C139Client;

  constructor(client: C139Client) {
    this.client = client;
  }

  /**
   * 获取分享标题
   */
  async getOutLinkTitle(linkId: string): Promise<string | null> {
    const req = { linkID: linkId, isPasswd: 1, account: "" };
    const resp = await this.client.sharePost(
      C139_SHARE_GENERAL_URL,
      JSON.stringify({ getOutLinkGeneralReq: req }),
      false,
    );
    if (!isC139Success(resp)) return null;
    const data = (resp.data || {}).getOutLinkGeneralResp || {};
    const array = data.outLinkGeneral || [];
    if (!array.length) return null;
    return (array[0] || {}).lkName || null;
  }

  /**
   * 获取分享提取码
   */
  async getOutLinkPassword(linkId: string): Promise<string | null> {
    const req = { linkID: linkId, isPasswd: 1, account: "" };
    const resp = await this.client.sharePost(
      C139_SHARE_GENERAL_URL,
      JSON.stringify({ getOutLinkGeneralReq: req }),
      false,
    );
    if (!isC139Success(resp)) return null;
    const data = (resp.data || {}).getOutLinkGeneralResp || {};
    const array = data.outLinkGeneral || [];
    if (!array.length) return null;
    return (array[0] || {}).passwd || null;
  }

  /**
   * 列出分享文件
   * @param param.pcaId 父目录 ID，根目录为 "root"
   */
  async getShareFiles(
    param: IC139ShareFilesParam,
  ): Promise<IC139ShareFilesResult> {
    const { linkId, pcaId = "root", passwd = "", begin = 1, end = 200 } = param;
    const account = this.client.getAccount() || "";
    const req = {
      getOutLinkInfoReq: {
        account,
        linkID: linkId,
        passwd,
        caSrt: 0,
        coSrt: 0,
        srtDr: 1,
        bNum: begin,
        pCaID: pcaId,
        eNum: end,
      },
      commonAccountInfo: { account, accountType: 1 },
    };
    const resp = await this.client.sharePost(
      C139_SHARE_LIST_URL,
      JSON.stringify(req),
      false,
    );
    if (!isC139Success(resp)) {
      raiseApiError(resp, "c139 get share files failed");
    }
    const data = resp.data || {};
    const list: IC139File[] = [];
    for (const item of data.caLst || []) {
      list.push(parseShareFile(item, pcaId, true));
    }
    for (const item of data.coLst || []) {
      const isDir = Boolean(item.isdir) || Number(item.coType || 1) === 2;
      list.push(parseShareFile(item, pcaId, isDir));
    }
    return { list, raw: resp };
  }

  /**
   * 获取分享文件下载链接
   */
  async getShareDownloadLink(
    param: IC139ShareDownloadParam,
  ): Promise<IC139DownloadLink | null> {
    const { coId, linkId } = param;
    const account = this.client.getAccount() || "";
    const authorization = this.client.getAuthorization();
    const reqV3 = {
      account,
      linkID: linkId,
      coIDLst: { item: [coId] },
      commonAccountInfo: { account, accountType: 1 },
    };
    const resp = await this.client.sharePost(
      C139_SHARE_LINK_URL,
      JSON.stringify({ dlFromOutLinkReqV3: reqV3 }),
      true,
    );
    if (!isC139Success(resp)) {
      raiseApiError(resp, "c139 get share download link failed");
    }
    const data = resp.data || {};
    const url = data.redrUrl || "";
    if (!url) return null;
    const fileName = data.fileName || data.coName || coId;
    const size = Number(data.coSize || data.size || 0);
    return { fid: coId, fileName, downloadUrl: url, size };
  }

  // ===================== 转存 =====================

  /**
   * 创建转存任务
   * @returns 任务 ID
   */
  async createTransferTask(param: IC139TransferParam): Promise<string | null> {
    const { coIdList, catalogIdList = [], toFolderId, linkId } = param;
    const account = this.client.getAccount() || "";
    const taskInfo = {
      contentInfoList: coIdList,
      catalogInfoList: catalogIdList,
      newCatalogID: toFolderId,
      linkID: linkId,
      newCatalogName: "",
      needPassword: true,
    };
    const req = {
      createOuterLinkBatchOprTaskReq: {
        msisdn: account,
        ownerAccount: "",
        taskType: 1,
        taskInfo,
        linkID: linkId,
        needPassword: true,
      },
      commonAccountInfo: { account, accountType: 1 },
    };
    const resp = await this.client.sharePost(
      C139_TRANSFER_CREATE_URL,
      JSON.stringify(req),
      true,
    );
    if (!isC139Success(resp)) {
      raiseApiError(resp, "c139 create transfer task failed");
    }
    return (resp.data || {}).taskID || null;
  }

  /**
   * 查询转存任务状态
   */
  async queryTransferTask(taskId: string): Promise<IC139TransferResult> {
    const account = this.client.getAccount() || "";
    const req = {
      queryBatchOprTaskDetailReq: {
        taskID: taskId,
        msisdn: account,
        commonAccountInfo: { account, accountType: 1 },
      },
    };
    const resp = await this.client.sharePost(
      C139_TRANSFER_QUERY_URL,
      JSON.stringify(req),
      true,
    );
    if (!isC139Success(resp)) {
      raiseApiError(resp, "c139 query transfer task failed");
    }
    const data = resp.data || {};
    const task = data.batchOprTask || {};
    const done =
      Number(task.progress || 0) >= 100 && Number(task.taskStatus || 0) === 2;
    const mapping: Record<string, string> = {};
    const contentIds = (data.contentList || {}).idRspInfo || [];
    for (const item of contentIds) {
      if (item.reason === "0000") {
        mapping[item.srcId] = item.rstId;
      }
    }
    const catalogIds = (data.catalogList || {}).idRspInfo || [];
    for (const item of catalogIds) {
      if (item.reason === "0000") {
        mapping[item.srcId] = item.rstId;
      }
    }
    return { done, mapping, raw: resp };
  }

  /**
   * 等待转存任务完成（轮询）
   */
  async waitTransferTask(taskId: string): Promise<IC139TransferResult> {
    for (let i = 0; i < C139_TASK_POLL_MAX; i++) {
      const result = await this.queryTransferTask(taskId);
      if (result.done) return result;
      await new Promise((resolve) =>
        setTimeout(resolve, C139_TASK_POLL_INTERVAL),
      );
    }
    throw ApiError.create("c139 transfer task timed out");
  }

  /**
   * 创建分享链接
   * @param coIdList 文件 ID 列表
   * @param dedicatedName 分享名称
   * @param caIdList 目录 ID 列表
   * @param period 有效期数值
   * @param periodUnit 有效期单位（1: 天）
   * @returns 分享链接信息
   */
  async createShare(
    coIdList: string[],
    dedicatedName: string,
    caIdList: string[] = [],
    period = 1,
    periodUnit = 1,
  ): Promise<{
    linkUrl: string;
    passwd: string;
    linkId: string;
    raw: Record<string, any>;
  }> {
    const account = this.client.getAccount() || "";
    const req = {
      getOutLinkReq: {
        subLinkType: 0,
        encrypt: 0,
        coIDLst: coIdList,
        caIDLst: caIdList,
        pubType: 1,
        dedicatedName,
        period,
        periodUnit,
        viewerLst: [],
        extInfo: { isWatermark: 0, shareChannel: "3001" },
        commonAccountInfo: { account, accountType: 1 },
      },
    };
    const resp = await this.client.cloudPost(C139_CREATE_SHARE_URL, req);
    if (!isC139Success(resp)) {
      raiseApiError(resp, "c139 create share failed");
    }
    const resSet = (resp.data || {}).getOutLinkRes?.getOutLinkResSet || [];
    if (!resSet.length) {
      raiseApiError(resp, "c139 create share: empty result");
    }
    const item = resSet[0];
    return {
      linkUrl: item.linkUrl || "",
      passwd: item.passwd || "",
      linkId: item.linkID || "",
      raw: resp,
    };
  }
}
