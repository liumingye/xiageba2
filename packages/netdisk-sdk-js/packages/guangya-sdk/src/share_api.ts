import { GuangyaClient } from "./client";
import {
  GUANGYA_API_USER_RES,
  GUANGYA_API_USER_RES_V2,
  GUANGYA_TASK_POLL_INTERVAL,
  GUANGYA_TASK_POLL_MAX,
} from "./const";
import { isGuangyaSuccess, extractGuangyaMessage, ApiError } from "./errors";
import {
  parseGuangyaFile,
  extractItems,
  clean,
  firstNonNil,
  normalizeParentId,
} from "./fs_api";
import {
  IGuangyaCreateShareParam,
  IGuangyaCreateShareResult,
  IGuangyaFile,
  IGuangyaParsedShareURL,
  IGuangyaRestoreParam,
  IGuangyaRestoreResult,
  IGuangyaShareAccessTokenResult,
  IGuangyaShareFilesListParam,
  IGuangyaShareFilesListResult,
  IGuangyaShareSummaryResult,
  IGuangyaTaskStatusResult,
} from "./types";

/** 辅助：失败时抛出带响应片段的错误 */
const raiseApiError = (
  payload: Record<string, any>,
  fallback: string,
): never => {
  const msg = extractGuangyaMessage(payload) || fallback;
  const snippet = JSON.stringify(payload).slice(0, 500);
  throw ApiError.create(`${msg}; body=${snippet}`);
};

/** 构建创建分享请求载荷（抓包原样） */
const buildSharePayload = (
  fileIds: string[],
  title: string,
): Record<string, any> => ({
  fileIds,
  title,
  validateDuration: 0,
  shareType: 0, // 0: 无提取码 1: 随机生成 2: 自定义提取码
  autoFillCode: true, // 是否自动填充提取码
  trafficLimit: "0",
  maxRestoreCount: 0,
  downloadType: 1,
  enableShareCode: false,
  shareCode: "",
});

/** 从响应提取访问令牌（data 为串或对象） */
const extractShareAccessToken = (payload: Record<string, any>): string => {
  const data = payload.data !== undefined ? payload.data : payload;
  if (typeof data === "string") return data.trim();
  if (data && typeof data === "object") {
    const v = clean(firstNonNil(data, "access_token", "accessToken", "token"));
    if (v) return v;
  }
  return clean(firstNonNil(payload, "access_token", "accessToken", "token"));
};

/** 从响应提取任务/对象 ID */
const extractTaskId = (payload: Record<string, any>): string => {
  const scopes: Record<string, any>[] = [];
  const data =
    payload.data && typeof payload.data === "object" ? payload.data : null;
  if (data) scopes.push(data);
  scopes.push(payload);
  for (const scope of scopes) {
    const v = clean(firstNonNil(scope, "taskId", "task_id", "id"));
    if (v) return v;
  }
  return "";
};

/** 任务状态判定 */
const parseTaskStatus = (
  payload: Record<string, any>,
): IGuangyaTaskStatusResult => {
  const data = payload.data;
  const statusVal: number = data.status;
  let done = false;
  let failed = false;

  switch (statusVal) {
    case 2:
      done = true;
      break;
    case 3:
      failed = true;
      break;
  }

  return {
    status: statusVal,
    done,
    failed,
    message: payload.msg,
    raw: payload,
  };
};

export class GuangyaShareApi {
  client: GuangyaClient;

  constructor(client: GuangyaClient) {
    this.client = client;
  }

  // ===================== 匿名 API（无需登录态）=====================

  /**
   * 分享摘要（存在性校验，匿名）
   */
  async shareSummary(shareId: string): Promise<IGuangyaShareSummaryResult> {
    const payload = await this.client.postJSONAnonymous<Record<string, any>>(
      `${GUANGYA_API_USER_RES}/get_share_summary`,
      { shareId },
    );
    return { exists: isGuangyaSuccess(payload), raw: payload };
  }

  /**
   * 提取码换分享访问令牌（匿名）
   */
  async shareAccessToken(
    shareId: string,
    code = "",
  ): Promise<IGuangyaShareAccessTokenResult> {
    const payload = await this.client.postJSONAnonymous<Record<string, any>>(
      `${GUANGYA_API_USER_RES}/get_share_access_token`,
      { shareId, code },
    );
    const accessToken = extractShareAccessToken(payload);
    return { accessToken, raw: payload };
  }

  /**
   * 分享文件列表（匿名，分页从 1 起）
   */
  async shareFilesList(
    param: IGuangyaShareFilesListParam,
  ): Promise<IGuangyaShareFilesListResult> {
    const { accessToken, parentId = "", page = 1, pageSize = 50 } = param;
    const payload = await this.client.postJSONAnonymous<Record<string, any>>(
      `${GUANGYA_API_USER_RES}/get_share_page_files_list`,
      {
        accessToken,
        parentId,
        page,
        pageSize,
        orderBy: 0,
        sortType: 0,
      },
    );
    if (!isGuangyaSuccess(payload)) {
      raiseApiError(payload, "guangya share files list failed");
    }
    const items = extractItems(payload);
    const list = items.map(parseGuangyaFile);
    return { list, raw: payload };
  }

  // ===================== 登录态 API =====================

  /**
   * 转存分享到自己盘（不返回新 fid，靠目录 diff）
   */
  async restoreShare(
    param: IGuangyaRestoreParam,
  ): Promise<IGuangyaRestoreResult> {
    const { accessToken, fileIds, parentId } = param;
    const payload = await this.client.postJSON<Record<string, any>>(
      `${GUANGYA_API_USER_RES}/restore_share`,
      {
        accessToken,
        fileIds,
        parentId: normalizeParentId(parentId),
      },
    );
    if (!isGuangyaSuccess(payload)) {
      raiseApiError(payload, "guangya restore share failed");
    }
    const taskId = extractTaskId(payload);
    return { taskId: taskId || undefined, raw: payload };
  }

  /**
   * 任务状态查询
   */
  async taskStatus(taskId: string): Promise<IGuangyaTaskStatusResult> {
    const payload = await this.client.postJSON<Record<string, any>>(
      `${GUANGYA_API_USER_RES}/get_task_status`,
      { taskId },
    );
    return parseTaskStatus(payload);
  }

  /**
   * 等待转存任务完成
   */
  async waitTask(taskId: string): Promise<IGuangyaTaskStatusResult> {
    for (let i = 0; i < GUANGYA_TASK_POLL_MAX; i++) {
      const status = await this.taskStatus(taskId);
      if (status.failed) {
        throw ApiError.create(status.message || "guangya task failed");
      }
      if (status.done) return status;
      await new Promise((resolve) =>
        setTimeout(resolve, GUANGYA_TASK_POLL_INTERVAL),
      );
    }
    throw ApiError.create("guangya task timed out");
  }

  /**
   * 创建分享
   */
  async createShare(
    param: IGuangyaCreateShareParam,
  ): Promise<IGuangyaCreateShareResult> {
    const { fileIds, title = "资源分享" } = param;
    const payload = await this.client.postJSON<Record<string, any>>(
      `${GUANGYA_API_USER_RES_V2}/share_file`,
      buildSharePayload(fileIds, title),
    );
    if (!isGuangyaSuccess(payload)) {
      raiseApiError(payload, "guangya create share failed");
    }
    const data =
      payload.data && typeof payload.data === "object" ? payload.data : {};
    const shareUrl = clean(data["shareUrl"]);
    if (!shareUrl) {
      throw ApiError.create(
        "guangya create share success but missing shareUrl",
      );
    }
    const code = clean(data["code"]);
    return { shareUrl, code: code || undefined, raw: payload };
  }
}

// ===================== URL 解析 =====================

/** 判断是否光鸭链接（guangyapan.com 子串匹配） */
export const isGuangyaURL = (rawURL: string): boolean => {
  try {
    const trimmed = rawURL.trim();
    const urlObj = new URL(trimmed);
    const host = urlObj.hostname.toLowerCase();
    // 精确匹配主域名，支持子域名如 xxx.guangyapan.com
    return host === "guangyapan.com" || host.endsWith(".guangyapan.com");
  } catch {
    // 不是合法URL直接返回false
    return false;
  }
};

/**
 * 从光鸭分享链接解析分享标识与提取码。
 * 提取码优先级：URL 查询参数(code/pwd/passcode/accessCode)。
 * 注意：分享标识大小写敏感，禁止对 URL 整体 ToLower。
 */
export const parseGuangyaShareURL = (
  rawURL: string,
): IGuangyaParsedShareURL => {
  let shareId = "";
  let passcode = "";

  try {
    const url = new URL(rawURL);
    const params = url.searchParams;

    const getCI = (...keys: string[]): string => {
      for (const key of keys) {
        const v = params.get(key);
        if (v && v.trim() !== "") return v.trim();
      }
      // 大小写不敏感兜底
      for (const [k, vs] of params.entries()) {
        for (const key of keys) {
          if (k.toLowerCase() === key.toLowerCase() && vs && vs.trim() !== "") {
            return vs.trim();
          }
        }
      }
      return "";
    };

    passcode = getCI("pwd", "code", "passcode", "accessCode");
    shareId = getCI("shareId", "share_id", "id", "sid");

    // 路径模式 /s/ /share/ /link/ /download/（保留原始大小写）
    if (!shareId && url.pathname) {
      const path = url.pathname;
      for (const prefix of ["/s/", "/share/", "/link/", "/download/"]) {
        const idx = path.indexOf(prefix);
        if (idx !== -1) {
          const token = path.slice(idx + prefix.length).replace(/\/+$/, "");
          if (token) {
            shareId = token;
            break;
          }
        }
      }
    }
  } catch {
    // URL 解析失败，尝试正则提取
    // 提取码
    const passcodeMatch = rawURL.match(
      /[?&](?:code|pwd|passcode|accessCode)=([^&#]+)/i,
    );
    if (passcodeMatch) passcode = decodeURIComponent(passcodeMatch[1]);
    // 路径中的分享ID
    const pathMatch = rawURL.match(/\/(?:s|share|link|download)\/([^/?#]+)/i);
    if (pathMatch) shareId = pathMatch[1];
  }

  return { shareId, passcode };
};

export {
  extractTaskId,
  parseTaskStatus,
  extractShareAccessToken,
  buildSharePayload,
};
