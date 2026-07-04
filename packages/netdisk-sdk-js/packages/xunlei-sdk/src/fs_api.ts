import { XunleiClient } from "./client";
import {
  IXunleiFile,
  IXunleiListFilesParam,
  IXunleiListFilesResult,
} from "./types";

export interface IXunleiRawFile {
  id?: string;
  file_id?: string;
  name?: string;
  kind?: string;
  is_dir?: boolean;
  size?: number;
  created_at?: string;
  updated_at?: string;
}

export interface IXunleiListFilesData {
  files?: IXunleiRawFile[];
  next_page_token?: string;
}

export interface IXunleiCreateFolderData {
  file?: IXunleiRawFile;
}

export class XunleiFSApi {
  client: XunleiClient;

  constructor(client: XunleiClient) {
    this.client = client;
  }

  /**
   * 列出文件列表
   */
  async listFiles(
    param: IXunleiListFilesParam = {},
  ): Promise<IXunleiListFilesResult> {
    const { parentId = "", limit = 100, pageToken = "" } = param;

    const data = await this.client.request<IXunleiListFilesData>(
      "GET",
      "/drive/v1/files",
      {
        query: {
          parent_id: parentId,
          filters: JSON.stringify({
            phase: { eq: "PHASE_TYPE_COMPLETE" },
            trashed: { eq: false },
          }),
          with_audit: true,
          thumbnail_size: "SIZE_SMALL",
          limit,
          page_token: pageToken,
        },
      },
    );

    const list: IXunleiFile[] = [];
    for (const file of data.files ?? []) {
      const id = file.id ?? file.file_id;
      if (!id) continue;
      list.push({
        id,
        name: file.name ?? "",
        kind: file.kind,
        is_dir: file.is_dir ?? file.kind === "drive#folder",
        size: file.size,
        created_at: file.created_at,
        updated_at: file.updated_at,
      });
    }

    return {
      list,
      next_page_token: data.next_page_token,
    };
  }

  /**
   * 创建目录
   */
  async mkdir(name: string, parentId = ""): Promise<IXunleiFile> {
    const data = await this.client.request<IXunleiCreateFolderData>(
      "POST",
      "/drive/v1/files",
      {
        body: {
          kind: "drive#folder",
          name,
          parent_id: parentId,
          space: "",
        },
      },
    );

    if (!data.file) {
      throw new Error("xunlei create directory response missing file");
    }

    const file = data.file;
    const id = file.id ?? file.file_id;
    if (!id) {
      throw new Error("xunlei create directory response missing file id");
    }

    return {
      id,
      name: file.name ?? name,
      kind: file.kind,
      is_dir: file.is_dir ?? true,
      size: file.size,
      created_at: file.created_at,
      updated_at: file.updated_at,
    };
  }

  /**
   * 重命名文件
   */
  async rename(fileId: string, name: string): Promise<void> {
    await this.client.request("PATCH", `/drive/v1/files/${fileId}`, {
      body: {
        name,
        space: "",
      },
    });
  }

  /**
   * 删除文件（批量）
   */
  async delete(fileIds: string[]): Promise<void> {
    await this.client.request("POST", "/drive/v1/files:batchDelete", {
      body: {
        ids: fileIds,
        space: "",
      },
    });
  }

  /**
   * 查找或创建目录
   */
  async findOrCreateDir(name: string, parentId = ""): Promise<IXunleiFile> {
    const result = await this.listFiles({ parentId, limit: 200 });
    const existing = result.list.find((f) => f.name === name && f.is_dir);
    if (existing) return existing;
    return this.mkdir(name, parentId);
  }
}
