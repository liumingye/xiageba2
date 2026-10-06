import { GuangyaClient } from "./client";
import {
  GUANGYA_API_ASSETS,
  GUANGYA_API_USER_RES,
  GUANGYA_API_USER_RES_V2,
  GUANGYA_ACCOUNT_API,
} from "./const";
import { isGuangyaSuccess, extractGuangyaMessage, ApiError } from "./errors";
import {
  IGuangyaAssetsResult,
  IGuangyaCreateDirParam,
  IGuangyaFile,
  IGuangyaListFilesParam,
  IGuangyaListFilesResult,
  IGuangyaUserInfoResult,
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

/** 归一化 parentId："0" / "/" / "root" → "" */
const normalizeParentId = (parentId?: string): string => {
  if (!parentId) return "";
  if (parentId === "0" || parentId === "/" || parentId === "root") return "";
  return parentId;
};

/** 从响应条目中提取文件信息 */
const parseGuangyaFile = (item: Record<string, any>): IGuangyaFile => {
  const fid = clean(firstNonNil(item, "fileId")) || "0";
  const fileName = clean(firstNonNil(item, "fileName"));
  const isDir = parseIsDir(item);
  const size = toNumber(firstNonNil(item, "fileSize"));
  return { fid, fileName, isDir, size, raw: item };
};

const clean = (v: any): string => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
};

const firstNonNil = (obj: Record<string, any>, ...keys: string[]): any => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

const toNumber = (v: any): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isNaN(n) ? undefined : n;
};

const parseIsDir = (item: Record<string, any>): boolean => {
  for (const k of ["dir", "isDir", "isFolder", "folder"]) {
    const v = item[k];
    if (v !== undefined && v !== null) return toBool(v);
  }
  for (const k of ["fileType", "type"]) {
    const v = item[k];
    if (v !== undefined && v !== null) {
      const text = String(v).trim().toLowerCase();
      if (
        text === "0" ||
        text === "dir" ||
        text === "folder" ||
        text === "directory"
      )
        return true;
    }
  }
  const resType = item["resType"];
  if (resType !== undefined && resType !== null) {
    return String(resType).trim().toLowerCase() === "2";
  }
  return false;
};

const toBool = (v: any): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const text = String(v).trim().toLowerCase();
  return (
    text === "1" ||
    text === "true" ||
    text === "yes" ||
    text === "y" ||
    text === "folder" ||
    text === "dir" ||
    text === "directory"
  );
};

/** 提取列表条目（data 为 list 或 data/list|items|records|rows|fileList|files） */
const extractItems = (payload: Record<string, any>): Record<string, any>[] => {
  const data = payload.data !== undefined ? payload.data : payload;
  if (Array.isArray(data))
    return data.filter((i) => i && typeof i === "object");
  if (data && typeof data === "object") {
    for (const k of ["list", "items", "records", "rows", "fileList", "files"]) {
      if (Array.isArray(data[k]))
        return data[k].filter((i) => i && typeof i === "object");
    }
  }
  if (payload && typeof payload === "object") {
    for (const k of ["list", "items", "records", "rows"]) {
      if (Array.isArray(payload[k]))
        return payload[k].filter((i) => i && typeof i === "object");
    }
  }
  return [];
};

export class GuangyaFSApi {
  client: GuangyaClient;

  constructor(client: GuangyaClient) {
    this.client = client;
  }

  /**
   * 个人盘目录列表（分页从 0 起）
   */
  async listFiles(
    param: IGuangyaListFilesParam = {},
  ): Promise<IGuangyaListFilesResult> {
    const {
      parentId,
      page = 0,
      pageSize = 50,
      sortType = 0,
      orderBy = 0,
    } = param;
    const payload = await this.client.postJSON<Record<string, any>>(
      `${GUANGYA_API_USER_RES_V2}/file/get_file_list`,
      {
        parentId: normalizeParentId(parentId),
        page,
        pageSize,
        orderBy,
        sortType,
      },
    );
    if (!isGuangyaSuccess(payload)) {
      raiseApiError(payload, "guangya list files failed");
    }
    const items = extractItems(payload);
    const list = items.map(parseGuangyaFile);
    return { list, raw: payload };
  }

  /**
   * 创建目录
   */
  async createDir(
    param: IGuangyaCreateDirParam,
  ): Promise<{ fid: string; raw: Record<string, any> }> {
    const { dirName, parentId } = param;
    const payload = await this.client.postJSON<Record<string, any>>(
      `${GUANGYA_API_USER_RES}/file/create_dir`,
      {
        dirName,
        parentId: normalizeParentId(parentId),
      },
    );
    if (!isGuangyaSuccess(payload)) {
      raiseApiError(payload, "guangya create dir failed");
    }
    const data =
      payload.data && typeof payload.data === "object" ? payload.data : payload;
    const fid = clean(firstNonNil(data, "fileId"));
    return { fid: fid || "0", raw: payload };
  }

  /**
   * 删除文件（批量）
   */
  async delete(fileIds: string[]): Promise<{ raw: Record<string, any> }> {
    const payload = await this.client.postJSON<Record<string, any>>(
      `${GUANGYA_API_USER_RES}/file/delete_file`,
      { fileIds },
    );
    if (!isGuangyaSuccess(payload)) {
      raiseApiError(payload, "guangya delete files failed");
    }
    return { raw: payload };
  }

  /**
   * 清空回收站
   * 返回异步任务 ID，可配合任务状态接口轮询
   */
  async clearRecycleBin(): Promise<{
    taskId?: string;
    raw: Record<string, any>;
  }> {
    const payload = await this.client.postJSON<Record<string, any>>(
      `${GUANGYA_API_USER_RES_V2}/file/clear_recycle_bin`,
      {},
    );
    if (!isGuangyaSuccess(payload)) {
      raiseApiError(payload, "guangya clear recycle bin failed");
    }
    const data =
      payload.data && typeof payload.data === "object" ? payload.data : {};
    const taskId = clean(firstNonNil(data, "taskId"));
    return { taskId: taskId || undefined, raw: payload };
  }

  /**
   * 容量/会员信息
   */
  async getAssets(): Promise<IGuangyaAssetsResult> {
    const payload = await this.client.postJSON<Record<string, any>>(
      `${GUANGYA_API_ASSETS}/get_assets`,
      {},
    );
    if (!isGuangyaSuccess(payload)) {
      raiseApiError(payload, "guangya get assets failed");
    }
    const data =
      payload.data && typeof payload.data === "object" ? payload.data : {};
    const totalSpace = toNumber(data["totalSpaceSize"]);
    const usedSpace = toNumber(data["usedSpaceSize"]);
    const vipStatus =
      (toNumber(data["vipStatus"]) ?? 0) > 0 ||
      (toNumber(data["svipStatus"]) ?? 0) > 0;
    return { totalSpace, usedSpace, vipStatus, raw: payload };
  }

  /**
   * 用户信息（user/me）
   * 注意：该接口直接返回用户对象（含 sub/name/phone_number），无 success/code/data 包装，
   * 故以是否含标识字段判定成功，而非 isGuangyaSuccess。
   */
  async userInfo(): Promise<IGuangyaUserInfoResult> {
    const payload = await this.client.getJSON<Record<string, any>>(
      `${GUANGYA_ACCOUNT_API}/user/me`,
    );
    const data =
      payload.data && typeof payload.data === "object" ? payload.data : payload;
    const nickname = clean(firstNonNil(data, "name"));
    const phone = clean(firstNonNil(data, "phone_number"));
    if (!nickname && !phone && !clean(data["sub"])) {
      raiseApiError(payload, "guangya get user info failed");
    }
    return { nickname, phone, raw: payload };
  }
}

export {
  normalizeParentId,
  parseGuangyaFile,
  extractItems,
  clean,
  firstNonNil,
  toNumber,
  toBool,
  parseIsDir,
};
