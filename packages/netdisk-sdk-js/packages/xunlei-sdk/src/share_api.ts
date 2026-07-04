import { XunleiClient } from "./client";
import { ApiError } from "./errors";
import {
  IXunleiShareDetail,
  IXunleiShareFile,
  IXunleiRestoreResult,
  IXunleiTaskResult,
  IXunleiCreateShareResult,
  IXunleiCreateShareParam,
} from "./types";

export interface IGetShareParam {
  shareId: string;
  passCode?: string;
  limit?: number;
  pageToken?: string;
}

export interface IShareDetailData {
  share_status?: string;
  share_status_text?: string;
  title?: string;
  pass_code_token?: string;
  files?: Array<{
    id?: string;
    file_id?: string;
    name?: string;
    kind?: string;
    is_dir?: boolean;
    size?: number;
  }>;
}

export interface IRestoreParam {
  shareId: string;
  passCodeToken: string;
  parentId: string;
  fileIds: string[];
}

export class XunleiShareApi {
  client: XunleiClient;

  constructor(client: XunleiClient) {
    this.client = client;
  }

  /**
   * 获取分享详情
   */
  async getShare(param: IGetShareParam): Promise<IXunleiShareDetail> {
    const { shareId, passCode = "", limit = 100, pageToken = "" } = param;

    const data = await this.client.request<IShareDetailData>(
      "GET",
      "/drive/v1/share",
      {
        query: {
          share_id: shareId,
          pass_code: passCode,
          limit,
          pass_code_token: "",
          page_token: pageToken,
          thumbnail_size: "SIZE_SMALL",
        },
      },
    );

    if (data.share_status && data.share_status !== "OK") {
      throw ApiError.create(
        "xunlei share status is {share_status}, text={share_status_text}",
        data as unknown as Record<string, unknown>,
      );
    }

    const files: IXunleiShareFile[] = [];
    for (const file of data.files ?? []) {
      const id = file.id ?? file.file_id;
      if (!id) continue;
      files.push({
        id,
        file_id: id,
        name: file.name ?? "",
        kind: file.kind,
        is_dir: file.is_dir ?? file.kind === "drive#folder",
        size: file.size,
      });
    }

    return {
      shareId,
      title: data.title ?? "",
      passCodeToken: data.pass_code_token ?? "",
      files,
      share_status: data.share_status,
      share_status_text: data.share_status_text,
    };
  }

  /**
   * 转存分享文件到指定目录
   */
  async restore(param: IRestoreParam): Promise<IXunleiRestoreResult> {
    const data = await this.client.request<IXunleiRestoreResult>(
      "POST",
      "/drive/v1/share/restore",
      {
        body: {
          parent_id: param.parentId,
          share_id: param.shareId,
          pass_code_token: param.passCodeToken,
          ancestor_ids: [],
          specify_parent_id: true,
          file_ids: param.fileIds,
        },
      },
    );

    if (!data.restore_task_id) {
      throw ApiError.create("xunlei restore response missing restore_task_id");
    }

    return data;
  }

  /**
   * 查询转存任务状态
   */
  async getTask(taskId: string): Promise<IXunleiTaskResult> {
    return this.client.request<IXunleiTaskResult>(
      "GET",
      `/drive/v1/tasks/${taskId}`,
    );
  }

  /**
   * 等待转存任务完成
   */
  async waitTask(
    taskId: string,
    options: { maxAttempts?: number; intervalMs?: number } = {},
  ): Promise<IXunleiTaskResult> {
    const { maxAttempts = 30, intervalMs = 1000 } = options;

    for (let i = 0; i < maxAttempts; i++) {
      const task = await this.getTask(taskId);
      if (task.progress === 100) {
        return task;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw ApiError.create("xunlei task timed out, task_id={taskId}", {
      taskId,
    });
  }

  /**
   * 创建分享
   */
  async createShare(
    param: IXunleiCreateShareParam,
  ): Promise<IXunleiCreateShareResult> {
    const {
      fileIds,
      title = "云盘资源分享",
      expirationDays = -1,
      restoreLimit = -1,
    } = param;

    const data = await this.client.request<IXunleiCreateShareResult>(
      "POST",
      "/drive/v1/share",
      {
        body: {
          file_ids: fileIds,
          share_to: "copy",
          params: {
            subscribe_push: "false",
            WithPassCodeInLink: "true",
          },
          title,
          restore_limit: restoreLimit,
          expiration_days: expirationDays,
        },
      },
    );

    if (!data.share_url) {
      throw ApiError.create("xunlei share response missing share_url");
    }

    return data;
  }

  public extractTraceFileIds(value?: string): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return Object.values(parsed)
        .map((item) => (typeof item === "string" ? item : undefined))
        .filter((item): item is string => Boolean(item));
    } catch {
      return [];
    }
  }
}
