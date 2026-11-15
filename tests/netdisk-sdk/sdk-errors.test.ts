import { describe, expect, it } from "vitest";
import {
  throwError as baiduThrowError,
  ApiError as BaiduApiError,
  HttpError as BaiduHttpError,
  BaiduClient,
} from "@netdisk-sdk/baidu-sdk";
import {
  throwError as quarkThrowError,
  ApiError as QuarkApiError,
  HttpError as QuarkHttpError,
} from "@netdisk-sdk/quarkuc-sdk";
import {
  throwError as xunleiThrowError,
  ApiError as XunleiApiError,
  HttpError as XunleiHttpError,
  XunleiClient,
} from "@netdisk-sdk/xunlei-sdk";
import {
  throwError as guangyaThrowError,
  AuthError as GuangyaAuthError,
  HttpError as GuangyaHttpError,
  raiseApiError as guangyaRaise,
  extractGuangyaMessage,
  GuangyaClient,
} from "@netdisk-sdk/guangya-sdk";
import {
  throwError as c139ThrowError,
  AuthError as C139AuthError,
  HttpError as C139HttpError,
  extractC139Message,
} from "@netdisk-sdk/c139-sdk";

const res = (status: number, body?: any, text?: string) => ({
  status,
  body,
  text,
});

/** 断言抛出的错误类型，并返回 err.info() 供字段校验 */
const infoOf = (fn: () => unknown, Type: new (...args: any[]) => Error) => {
  let err: any;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(Type);
  expect(typeof err.info).toBe("function");
  return err.info();
};

describe("百度 throwError", () => {
  it("errno 为 0 或字符串 0 都放行", () => {
    expect(baiduThrowError(res(200, { errno: 0 }))).toBe(true);
    expect(baiduThrowError(res(200, { errno: "0" }))).toBe(true);
  });

  it("errno 非 0 抛 ApiError，info() 保留原始字段", () => {
    const info = infoOf(
      () => baiduThrowError(res(200, { errno: 2, errmsg: "参数错误" })),
      BaiduApiError,
    );
    expect(info.errno).toBe(2);
    expect(info.errmsg).toBe("参数错误");
  });

  it("error_code 分支不要求 request_id 同时存在", () => {
    expect(baiduThrowError(res(200, { error_code: "0" }))).toBe(true);
    const info = infoOf(
      () => baiduThrowError(res(200, { error_code: 31066 })),
      BaiduApiError,
    );
    expect(info.error_code).toBe(31066);
  });

  it("body 为 JSON 字符串时先解析再判定", () => {
    expect(baiduThrowError(res(200, '{"errno":0}'))).toBe(true);
    expect(baiduThrowError(res(200, undefined, '{"errno":0}'))).toBe(true);
    expect(() => baiduThrowError(res(200, '{"errno":2}'))).toThrow(BaiduApiError);
  });

  it("非业务响应按 HTTP 状态兜底", () => {
    expect(baiduThrowError(res(200, {}))).toBe(true);
    const info = infoOf(() => baiduThrowError(res(500, {})), BaiduHttpError);
    expect(info.status).toBe(500);
  });
});

describe("夸克 throwError", () => {
  it("code 严格为 0 才放行", () => {
    expect(quarkThrowError(res(200, { code: 0, message: "ok" }))).toBe(true);
    const info = infoOf(
      () => quarkThrowError(res(200, { code: 32003, message: "空间不足" })),
      QuarkApiError,
    );
    expect(info.code).toBe(32003);
    expect(info.message).toBe("空间不足");
  });

  it("非夸克响应体按 HTTP 状态兜底", () => {
    expect(quarkThrowError(res(200, {}))).toBe(true);
    expect(infoOf(() => quarkThrowError(res(502, {})), QuarkHttpError).status).toBe(
      502,
    );
  });
});

describe("迅雷 throwError", () => {
  it("error_code 为 0 / 空串放行", () => {
    expect(xunleiThrowError(res(200, { error_code: 0 }))).toBe(true);
    expect(xunleiThrowError(res(200, { error: "" }))).toBe(true);
  });

  it("业务错误抛 ApiError，info() 带 error/error_description", () => {
    const info = infoOf(
      () =>
        xunleiThrowError(
          res(200, { error: "invalid_grant", error_description: "已过期" }),
        ),
      XunleiApiError,
    );
    expect(info.error).toBe("invalid_grant");
    expect(info.error_description).toBe("已过期");
  });

  it("无业务错误体时 401 仍按 HttpError 处理（沿用原语义）", () => {
    expect(infoOf(() => xunleiThrowError(res(401, {})), XunleiHttpError).status).toBe(
      401,
    );
    expect(xunleiThrowError(res(200, {}))).toBe(true);
  });

  it("getShare 的分享状态错误保留 share_status，供调用方禁用资源", async () => {
    const client = new XunleiClient({ refreshToken: "rt" });
    client.request = (async () => ({
      share_status: "EXPIRED",
      share_status_text: "分享已过期",
    })) as any;

    const err = await client.shareApi
      .getShare({ shareId: "s1" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(XunleiApiError);
    expect(err.info().share_status).toBe("EXPIRED");
    expect(err.info().share_status_text).toBe("分享已过期");
  });
});

describe("光鸭 / c139 throwError", () => {
  it("401 抛 AuthError，其余 4xx/5xx 抛 HttpError", () => {
    for (const [throwError, Auth, Http] of [
      [guangyaThrowError, GuangyaAuthError, GuangyaHttpError],
      [c139ThrowError, C139AuthError, C139HttpError],
    ] as const) {
      expect(infoOf(() => throwError(res(401, {})), Auth).status).toBe(401);
      expect(infoOf(() => throwError(res(500, {})), Http).status).toBe(500);
      expect(throwError(res(200, { code: 500, msg: "业务失败" }))).toBe(true);
    }
  });
});

describe("光鸭 raiseApiError 复用", () => {
  it("fs 与 share 两条路径抛出同一种带响应片段的错误", async () => {
    const client = new GuangyaClient({ refreshToken: "rt" });
    client.postJSON = async () => ({ code: 500, msg: "配额不足" });

    const fsErr = await client.fsApi.getAssets().catch((e) => e);
    const shareErr = await client.shareApi
      .createShare({ fileIds: ["1"] })
      .catch((e) => e);

    for (const err of [fsErr, shareErr]) {
      expect(err.message).toMatch(/^配额不足; body=/);
      expect(err.info().code).toBe(500);
    }
    expect(() => guangyaRaise({ msg: "x" }, "fallback")).toThrow(/^x; body=/);
    expect(() => guangyaRaise({}, "fallback")).toThrow(/^fallback; body=/);
  });
});

describe("错误消息提取复用共享层", () => {
  it("按各自 key 顺序从顶层与 data 中取第一个非空消息", () => {
    expect(extractGuangyaMessage({ msg: " a ", data: { message: "b" } })).toBe("a");
    expect(extractGuangyaMessage({ data: { errorMessage: "b" } })).toBe("b");
    expect(extractGuangyaMessage({})).toBe("");
    expect(extractC139Message({ desc: "d", message: "m" })).toBe("d");
    expect(extractC139Message({ data: { msg: "m" } })).toBe("m");
    expect(extractC139Message({})).toBe("");
  });
});

describe("百度 cookie 规范化", () => {
  it("无空格分隔的 cookie 串被规范化，避免第二个请求起丢失登录态", () => {
    const client = new BaiduClient({ source: "BAIDUID=a;BDUSS=b;STOKEN=c" });
    expect(client.source).toBe("BAIDUID=a; BDUSS=b; STOKEN=c");
  });

  it("同名键以新值覆盖，不产生重复段", () => {
    const client = new BaiduClient({ source: "BDUSS=old; BDUSS=new" });
    expect(client.source).toBe("BDUSS=new");
  });
});