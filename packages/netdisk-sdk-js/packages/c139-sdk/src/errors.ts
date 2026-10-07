import { Check } from "@netdisk-sdk/utils";
import { SError } from "error";
import { Response } from "superagent";

export class ApiError extends SError {}
/** http 请求错误 */
export class HttpError extends SError {}
/** 认证错误（cookie 无效 / authorization 缺失） */
export class AuthError extends SError {}

export interface IC139ErrorBody {
  success?: boolean;
  resultCode?: string | number;
  code?: string | number;
  desc?: string;
  message?: string;
  data?: unknown;
}

/**
 * 成功判定：
 * - success 不为 false
 * - code/resultCode 为空 / "0" / "0000"
 */
export const isC139Success = (payload: IC139ErrorBody): boolean => {
  if (payload.success === false) return false;
  const code = payload.resultCode ?? payload.code;
  if (code === undefined || code === null || code === "") return true;
  const text = String(code).trim();
  return text === "0" || text === "0000";
};

/** 提取错误消息 */
export const extractC139Message = (payload: IC139ErrorBody): string => {
  const scopes: IC139ErrorBody[] = [payload];
  const data = payload.data;
  if (Check.isObject(data)) {
    scopes.push(data as IC139ErrorBody);
  }
  for (const scope of scopes) {
    for (const k of ["desc", "message", "msg"] as const) {
      const v = (scope as any)[k];
      if (Check.isString(v) && v.trim() !== "") return v.trim();
    }
  }
  return "";
};

/** 仅处理 HTTP 层错误，业务成功/失败由各 API 方法自行判定 */
export const throwError = ({ body, status, text }: Response) => {
  if (Check.isString(body || text)) {
    try {
      body = JSON.parse(body || text);
    } catch {
      // ignore
    }
  }

  if (status >= 400) {
    if (status === 401) {
      throw AuthError.create("c139 auth error, status={status}", { status });
    }
    throw HttpError.create("http request error, status={status}", { status });
  }

  return true;
};

/** 失败时抛出带响应片段的错误 */
export const raiseApiError = (
  payload: Record<string, any>,
  fallback: string,
): never => {
  const msg = extractC139Message(payload) || fallback;
  const snippet = JSON.stringify(payload).slice(0, 500);
  throw ApiError.create(`${msg}; body=${snippet}`, payload);
};
