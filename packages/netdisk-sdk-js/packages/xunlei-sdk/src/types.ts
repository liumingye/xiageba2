export interface IXunleiFile {
  id: string;
  file_id?: string;
  name: string;
  kind?: string;
  is_dir?: boolean;
  size?: number;
  created_at?: string;
  updated_at?: string;
}

export interface IXunleiShareFile extends IXunleiFile {
  file_id: string;
}

export interface IXunleiShareDetail {
  shareId: string;
  title: string;
  passCodeToken: string;
  files: IXunleiShareFile[];
  share_status?: string;
  share_status_text?: string;
}

export interface IXunleiRestoreResult {
  restore_task_id: string;
}

export interface IXunleiTaskResult {
  task_id?: string;
  progress?: number;
  message?: string;
  status?: string;
  params?: {
    trace_file_ids?: string;
  };
}

export interface IXunleiCreateShareResult {
  share_id?: string;
  share_url?: string;
  pass_code?: string;
  title?: string;
}

export interface IXunleiCreateShareParam {
  fileIds: string[];
  title?: string;
  expirationDays?: number;
  restoreLimit?: number;
}

export interface IXunleiListFilesParam {
  parentId?: string;
  limit?: number;
  pageToken?: string;
}

export interface IXunleiListFilesResult {
  list: IXunleiFile[];
  next_page_token?: string;
}

export interface IXunleiTokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
}

export interface IXunleiCaptchaData {
  captcha_token: string;
  expires_in: number;
  url?: string;
}

export type IXunleiMethod = "GET" | "POST" | "PATCH";
