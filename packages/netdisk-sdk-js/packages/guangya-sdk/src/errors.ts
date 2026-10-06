import { Check } from "@netdisk-sdk/utils";
import { SError } from "error";
import { Response } from "superagent";

export class ApiError extends SError {}
/** http 请求错误 */
export class HttpError extends SError {}
/** 认证错误（401 / 令牌刷新失败） */
export class AuthError extends SError {}

export interface IGuangyaErrorBody {
  success?: boolean;
  ok?: boolean;
  code?: number | string;
  status?: number | string;
  result?: number | string;
  msg?: string;
  message?: string;
  errorMessage?: string;
  error_message?: string;
  detail?: string;
  data?: unknown;
}

export const isGuangyaApiResult = (body: any): body is IGuangyaErrorBody => {
  return Check.isObject(body);
};

/**
 * 提取错误消息（从顶层或 data 字段中查找 message/msg/errorMessage 等）
 */
export const extractGuangyaMessage = (payload: IGuangyaErrorBody): string => {
  const scopes: IGuangyaErrorBody[] = [payload];
  const data = payload.data;
  if (Check.isObject(data)) {
    scopes.push(data as IGuangyaErrorBody);
  }
  for (const scope of scopes) {
    for (const k of ["message", "msg", "errorMessage", "error_message", "detail"]) {
      const v = (scope as any)[k];
      if (Check.isString(v) && v.trim() !== "") return v.trim();
    }
  }
  return "";
};

/**
 * 成功判定（无统一数值 code，按 msg/data 容错）
 * - success / ok 为 true
 * - msg / message 为 "success"
 * - code / status / result 为 0 / 200 / "ok" / "success"
 * - 存在 data 字段且无错误消息
 */
export const isGuangyaSuccess = (payload: IGuangyaErrorBody): boolean => {
  if (payload.success === true || payload.ok === true) return true;
  for (const k of ["msg", "message"] as const) {
    const v = payload[k];
    if (Check.isString(v) && v.trim().toLowerCase() === "success") return true;
  }
  for (const k of ["code", "status", "result"] as const) {
    const v = (payload as any)[k];
    if (v === undefined || v === null) continue;
    const n = typeof v === "number" ? v : parseInt(String(v).trim(), 10);
    if (!Number.isNaN(n) && (n === 0 || n === 200)) return true;
    const text = String(v).trim().toLowerCase();
    if (text === "0" || text === "200" || text === "ok" || text === "success") return true;
  }
  if (payload.data !== undefined && payload.data !== null && extractGuangyaMessage(payload) === "") {
    return true;
  }
  return false;
};

/** 显式失败判定（code/status/result 明确非 0/200） */
export const hasGuangyaExplicitFailure = (payload: IGuangyaErrorBody): boolean => {
  for (const k of ["code", "status", "result"] as const) {
    const v = (payload as any)[k];
    if (v === undefined || v === null) continue;
    const n = typeof v === "number" ? v : parseInt(String(v).trim(), 10);
    if (!Number.isNaN(n) && n !== 0 && n !== 200) return true;
    const text = String(v).trim().toLowerCase();
    if (text !== "" && text !== "0" && text !== "200" && text !== "ok" && text !== "success" && text !== "true") {
      return true;
    }
  }
  return false;
};

export const throwError = ({ body, status, text }: Response) => {
  if (Check.isString(body || text)) {
    try {
      body = JSON.parse(body || text);
    } catch {
      // ignore
    }
  }

  // 光鸭响应无统一数值 code，成功/失败由各 API 方法自行判定（isGuangyaSuccess）。
  // 此处仅处理 HTTP 层错误，与 Go 实现 doJSONOnce 一致：只要 2xx 且能解析 JSON 即放行。
  if (status >= 400) {
    if (status === 401) {
      throw AuthError.create("guangya auth error, status={status}", { status });
    }
    throw HttpError.create("http request error, status={status}", { status });
  }

  return true;
};
