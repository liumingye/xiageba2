/** 文件/目录条目 */
export interface IC139File {
  /** 文件/目录 ID */
  fid: string;
  /** 文件名 */
  fileName: string;
  /** 是否为目录 */
  isDir: boolean;
  /** 文件大小（字节） */
  size: number;
  /** 父目录 ID */
  parentId: string;
  /** 修改时间 */
  modifyTime: string;
  /** 原始响应条目 */
  raw: Record<string, any>;
}

/** 下载链接信息 */
export interface IC139DownloadLink {
  /** 文件 ID */
  fid: string;
  /** 文件名 */
  fileName: string;
  /** 下载 URL */
  downloadUrl: string;
  /** 文件大小（字节） */
  size: number;
}

/** 分享文件列表参数 */
export interface IC139ShareFilesParam {
  /** 分享链接 ID */
  linkId: string;
  /** 父目录 ID（根目录传空串） */
  pcaId?: string;
  /** 提取码 */
  passwd?: string;
  /** 起始序号（从 1 开始） */
  begin?: number;
  /** 结束序号 */
  end?: number;
}

/** 分享文件列表结果 */
export interface IC139ShareFilesResult {
  list: IC139File[];
  raw: Record<string, any>;
}

/** 分享下载链接参数 */
export interface IC139ShareDownloadParam {
  /** 文件 ID */
  coId: string;
  /** 分享链接 ID */
  linkId: string;
}

/** 转存任务参数 */
export interface IC139TransferParam {
  /** 要转存的文件 ID 列表 */
  coIdList: string[];
  /** 要转存的目录 ID 列表 */
  catalogIdList?: string[];
  /** 转存到的目标目录 ID */
  toFolderId: string;
  /** 分享链接 ID */
  linkId: string;
}

/** 转存任务查询结果 */
export interface IC139TransferResult {
  /** 是否已完成 */
  done: boolean;
  /** 源 ID -> 结果 ID 映射 */
  mapping: {
    contentIds: string[];
    catalogIds: string[];
  };
  raw: Record<string, any>;
}

/** 解析出的分享 URL 信息 */
export interface IC139ParsedShareURL {
  /** 分享链接 ID */
  linkId: string;
  /** 提取码 */
  passcode: string;
}
