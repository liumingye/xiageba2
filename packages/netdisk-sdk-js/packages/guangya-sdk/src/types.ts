export interface IGuangyaCredential {
  accessToken: string;
  refreshToken?: string;
  deviceId: string;
}

export interface IGuangyaTokenData {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface IGuangyaFile {
  /** 文件/目录 ID */
  fid: string;
  /** 文件名 */
  fileName: string;
  /** 是否为目录 */
  isDir: boolean;
  /** 文件大小（字节） */
  size?: number;
  /** 原始响应条目 */
  raw: Record<string, any>;
}

export interface IGuangyaListFilesParam {
  parentId?: string;
  page?: number;
  pageSize?: number;
  /** 排序类型 0: 文件名 1: 文件大小 2: 创建时间 3: 修改时间 4: 文件类型 */
  sortType?: 0 | 1 | 2 | 3 | 4;
  /** 排序顺序 */
  orderBy?: 0 | 1;
  /** 过滤文件类型 */
  fileTypes?: number[];
}

export interface IGuangyaListFilesResult {
  list: IGuangyaFile[];
  raw: Record<string, any>;
}

export interface IGuangyaCreateDirParam {
  dirName: string;
  parentId?: string;
}

export interface IGuangyaCreateShareParam {
  fileIds: string[];
  title?: string;
}

export interface IGuangyaCreateShareResult {
  shareUrl: string;
  code?: string;
  raw: Record<string, any>;
}

export interface IGuangyaRestoreParam {
  accessToken: string;
  fileIds: string[];
  parentId?: string;
}

export interface IGuangyaRestoreResult {
  taskId?: string;
  raw: Record<string, any>;
}

export interface IGuangyaTaskStatusResult {
  /** 原始状态值 */
  status?: string | number;
  /** 是否已完成 */
  done: boolean;
  /** 是否已失败 */
  failed: boolean;
  message?: string;
  raw: Record<string, any>;
}

export interface IGuangyaAssetsResult {
  totalSpace?: number;
  usedSpace?: number;
  vipStatus?: boolean;
  raw: Record<string, any>;
}

export interface IGuangyaUserInfoResult {
  nickname?: string;
  phone?: string;
  raw: Record<string, any>;
}

export interface IGuangyaShareSummaryResult {
  exists: boolean;
  raw: Record<string, any>;
}

export interface IGuangyaShareAccessTokenResult {
  accessToken: string;
  raw: Record<string, any>;
}

export interface IGuangyaShareFilesListParam {
  accessToken: string;
  parentId?: string;
  page?: number;
  pageSize?: number;
}

export interface IGuangyaShareFilesListResult {
  list: IGuangyaFile[];
  raw: Record<string, any>;
}

export interface IGuangyaParsedShareURL {
  shareId: string;
  passcode: string;
}
