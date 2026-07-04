import { Check } from "@netdisk-sdk/utils";
import { SError } from "error";
import { Response } from "superagent";

export class ApiError extends SError {}
export class HttpError extends SError {}
export class AuthError extends SError {}

export interface IXunleiErrorBody {
  error?: string;
  error_code?: string | number;
  error_description?: string;
  message?: string;
}

export const isXunleiApiError = (body: any): body is IXunleiErrorBody => {
  return (
    Check.isObject(body) &&
    ("error" in body || "error_code" in body || "error_description" in body)
  );
};

export const throwError = ({ body, status, text }: Response) => {
  if (Check.isString(body || text)) {
    try {
      body = JSON.parse(body || text);
    } catch {
      // ignore
    }
  }

  if (isXunleiApiError(body)) {
    const code = body.error ?? body.error_code;
    if (code === undefined || code === "" || code === 0) return true;
    throw ApiError.create(
      "xunlei api error, code={error}, description={error_description}, message={message}",
      body as unknown as Record<string, unknown>,
    );
  }

  if (status >= 400) {
    throw HttpError.create("http request error, status={status}", { status });
  }

  return true;
};
