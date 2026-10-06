import { C139Client } from "./client";
import { C139_FILE_LIST_URL, C139_DOWNLOAD_URL, C139_BATCH_TRASH_URL } from "./const";
import { isC139Success, raiseApiError } from "./errors";
import { IC139File, IC139DownloadLink } from "./types";

/** 个人盘文件列表参数 */
export interface IC139ListFilesParam {
  /** 父目录 ID（根目录为 "/"） */
  parentFileId?: string;
  /** 分页游标（首页传 null） */
  pageCursor?: string | null;
  /** 每页数量 */
  pageSize?: number;
  /** 排序字段 */
  orderBy?: "updated_at" | "created_at" | "name" | "size";
  /** 排序方向 */
  orderDirection?: "ASC" | "DESC";
}

export interface IC139ListFilesResult {
  list: IC139File[];
  /** 下一页游标（null 表示无更多数据） */
  nextPageCursor: string | null;
  raw: Record<string, any>;
}

/** 解析个人盘文件条目（新 API 格式） */
const parseCloudFile = (item: Record<string, any>): IC139File => {
  const type = String(item.type || "").toLowerCase();
  const isDir = type === "folder" || type === "dir";
  const fid = String(item.fileId || item.coID || item.caID || "");
  const fileName = String(item.name || item.coName || item.fileName || "");
  const size = isDir ? 0 : Number(item.size ?? item.coSize ?? 0);
  const parentId = String(item.parentFileId ?? item.parentId ?? item.pCaID ?? "");
  const modifyTime = String(
    item.updatedAt ?? item.updateTime ?? item.udTime ?? item.createdAt ?? "",
  );
  return { fid, fileName, isDir, size, parentId, modifyTime, raw: item };
};

export class C139FSApi {
  client: C139Client;

  constructor(client: C139Client) {
    this.client = client;
  }

  /**
   * 个人盘文件列表
   * @param param.parentFileId 父目录 ID，根目录传 "/"
   */
  async listFiles(
    param: IC139ListFilesParam = {},
  ): Promise<IC139ListFilesResult> {
    this.client.ensureAuth();
    const {
      parentFileId = "/",
      pageCursor = null,
      pageSize = 100,
      orderBy = "updated_at",
      orderDirection = "DESC",
    } = param;
    const req = {
      pageInfo: { pageSize, pageCursor },
      orderBy,
      orderDirection,
      parentFileId,
      imageThumbnailStyleList: ["Small", "Large"],
    };
    const resp = await this.client.cloudPost(C139_FILE_LIST_URL, req);
    if (!isC139Success(resp)) {
      raiseApiError(resp, "c139 list files failed");
    }
    const data = resp.data || {};
    const list: IC139File[] = (data.items || []).map((item: any) =>
      parseCloudFile(item),
    );
    return {
      list,
      nextPageCursor: data.nextPageCursor ?? null,
      raw: resp,
    };
  }

  /**
   * 获取个人盘文件下载链接
   */
  async getDownloadUrl(coId: string): Promise<IC139DownloadLink | null> {
    this.client.ensureAuth();
    const req = {
      coID: coId,
    };
    const resp = await this.client.cloudPost(C139_DOWNLOAD_URL, req);
    if (!isC139Success(resp)) {
      raiseApiError(resp, "c139 get download url failed");
    }
    const data = resp.data || {};
    const url = data.downloadUrl || data.url || data.redrUrl || "";
    if (!url) return null;
    const fileName = data.fileName || data.coName || coId;
    const size = Number(data.coSize || data.size || 0);
    return { fid: coId, fileName, downloadUrl: url, size };
  }

  /**
   * 批量删除文件（移入回收站）
   * @param fileIds 文件 ID 列表
   * @returns 任务 ID
   */
  async batchTrash(fileIds: string[]): Promise<string> {
    this.client.ensureAuth();
    const resp = await this.client.cloudPost(C139_BATCH_TRASH_URL, { fileIds });
    if (!isC139Success(resp)) {
      raiseApiError(resp, "c139 batch trash failed");
    }
    return (resp.data || {}).taskId || "";
  }
}
