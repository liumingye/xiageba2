import { describe, expect, it, vi } from "vitest";
import {
  Check,
  CookieUtil,
  StringUtil,
  createThrowError,
  extractMessage,
  idempotentRetry,
  parseJsonBody,
  pollTask,
} from "@netdisk-sdk/utils";

describe("StringUtil.splitN", () => {
  it("按多字符分隔符切分，不吞掉分隔符后的字符", () => {
    expect(StringUtil.splitN("a==b==c", "==", 2)).toEqual(["a", "b==c"]);
    expect(StringUtil.splitN("a==b==c", "==")).toEqual(["a", "b", "c"]);
  });

  it("分隔符位于开头时保留空首段", () => {
    expect(StringUtil.splitN("=lead", "=", 2)).toEqual(["", "lead"]);
  });

  it("limit 限制段数，剩余部分留在最后一段", () => {
    expect(StringUtil.splitN("a=1=2=3", "=", 2)).toEqual(["a", "1=2=3"]);
    expect(StringUtil.splitN("a;b;c", ";", 1)).toEqual(["a;b;c"]);
  });

  it("无分隔符 / 空串 / limit<=0", () => {
    expect(StringUtil.splitN("abc", "=", 2)).toEqual(["abc"]);
    expect(StringUtil.splitN("", "=", 2)).toEqual([""]);
    expect(StringUtil.splitN("a;b", ";", 0)).toEqual(["a", "b"]);
  });

  it("支持正则分隔符", () => {
    expect(StringUtil.splitN("a1b22c", /\d+/, 2)).toEqual(["a", "b22c"]);
    expect(StringUtil.splitN("a1b22c", /\d+/g)).toEqual(["a", "b", "c"]);
  });

  it("空分隔符不死循环", () => {
    expect(StringUtil.splitN("abc", "")).toEqual(["abc"]);
  });
});

describe("CookieUtil", () => {
  it("键名去除前导空格", () => {
    expect([...CookieUtil.cookieToMap("a=1; b=2")]).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("mergeCookie 同名键覆盖而非追加（夸克 __puus 刷新依赖此行为）", () => {
    expect(CookieUtil.mergeCookie("a=1; b=2", "b=9")).toBe("a=1; b=9");
    expect(CookieUtil.mergeCookie("__puus=old; x=1", "__puus=new")).toBe(
      "__puus=new; x=1",
    );
  });

  it("mergeCookie 输出 '; ' 分隔，避免 superagent cookie jar 切分丢字段", () => {
    const merged = CookieUtil.mergeCookie("BDUSS=yyy;STOKEN=zzz", "BAIDUID=xxx");
    expect(merged).toBe("BDUSS=yyy; STOKEN=zzz; BAIDUID=xxx");
    expect(merged.split("; ").length).toBe(3);
  });

  it("保留值中的 '='，跳过空段与无键段", () => {
    expect([...CookieUtil.cookieToMap("token=a=b=c")]).toEqual([
      ["token", "a=b=c"],
    ]);
    expect([...CookieUtil.cookieToMap("a=1;;  ;b=2")]).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("空 cookie 合并", () => {
    expect(CookieUtil.mergeCookie("", "a=1")).toBe("a=1");
    expect(CookieUtil.mergeCookie("a=1")).toBe("a=1");
  });
});

describe("Check.isNumber", () => {
  it("收窄为 number 而不是 boolean", () => {
    const value: unknown = 42;
    if (Check.isNumber(value)) {
      const narrowed: number = value;
      expect(narrowed.toFixed(1)).toBe("42.0");
    } else {
      throw new Error("isNumber(42) 应为 true");
    }
    expect(Check.isNumber("42")).toBe(false);
  });
});

describe("parseJsonBody / extractMessage", () => {
  it("字符串 body 解析为对象，解析失败原样返回", () => {
    expect(parseJsonBody('{"errno":0}')).toEqual({ errno: 0 });
    expect(parseJsonBody(undefined, '{"errno":0}')).toEqual({ errno: 0 });
    expect(parseJsonBody("not json")).toBe("not json");
    expect(parseJsonBody({ errno: 0 })).toEqual({ errno: 0 });
  });

  it("按 key 顺序从顶层与 data 中提取消息", () => {
    expect(extractMessage({ msg: " top " }, ["message", "msg"])).toBe("top");
    expect(extractMessage({ data: { msg: "nested" } }, ["msg"])).toBe("nested");
    expect(extractMessage({ msg: "  " }, ["msg"])).toBe("");
    expect(extractMessage(null, ["msg"])).toBe("");
  });
});

describe("createThrowError", () => {
  const HttpError = { create: vi.fn((m: string) => new Error(`http:${m}`)) };
  const AuthError = { create: vi.fn((m: string) => new Error(`auth:${m}`)) };

  it("inspect 返回 true 直接放行，即使状态码 >= 400", () => {
    const ok = createThrowError({ inspect: () => true, HttpError });
    expect(ok({ status: 500, body: { errno: 0 } })).toBe(true);
  });

  it("inspect 抛出的业务错误原样透出", () => {
    const boom = new Error("biz");
    const ok = createThrowError({
      inspect: () => {
        throw boom;
      },
      HttpError,
    });
    expect(() => ok({ status: 200, body: {} })).toThrow(boom);
  });

  it("inspect 未识别时走 HTTP 兜底", () => {
    const ok = createThrowError({ inspect: () => false, HttpError });
    expect(ok({ status: 200 })).toBe(true);
    expect(() => ok({ status: 500 })).toThrow(/http request error/);
  });

  it("提供 AuthError 时 401 抛 AuthError", () => {
    const ok = createThrowError({ HttpError, AuthError, authMessage: "x {status}" });
    expect(() => ok({ status: 401 })).toThrow(/auth:x \{status\}/);
    expect(() => ok({ status: 403 })).toThrow(/http request error/);
  });

  it("字符串 body 先解析再交给 inspect", () => {
    const inspect = vi.fn(() => true);
    const ok = createThrowError({ inspect, HttpError });
    ok({ status: 200, body: '{"code":0}' });
    expect(inspect).toHaveBeenCalledWith({ code: 0 });
  });
});

describe("idempotentRetry", () => {
  const setup = (method: string) => {
    const retry = vi.fn();
    idempotentRetry(3)({ method, retry });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0]![0]).toBe(3);
    return retry.mock.calls[0]![1] as () => boolean | undefined;
  };

  it("非幂等方法禁止重放（转存/建分享/删除都是 POST）", () => {
    expect(setup("POST")()).toBe(false);
    expect(setup("post")()).toBe(false);
    expect(setup("PATCH")()).toBe(false);
  });

  it("幂等方法沿用 superagent 默认判定", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "TRACE", "PUT", "DELETE"]) {
      expect(setup(method)()).toBeUndefined();
    }
  });
});

describe("pollTask", () => {
  const timeoutError = (last: unknown) => new Error(`timeout:${JSON.stringify(last)}`);

  it("完成后立即返回，不再多睡一个间隔", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ status: 1 });
    const result = await pollTask(fetch, {
      isDone: (r: any) => r.status === 1,
      intervalMs: 1000,
      timeoutError,
    });
    expect(result).toEqual({ status: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("有次数上限，不会无界轮询", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 0 });
    await expect(
      pollTask(fetch, {
        isDone: (r: any) => r.status === 1,
        intervalMs: 0,
        maxAttempts: 4,
        timeoutError,
      }),
    ).rejects.toThrow(/timeout:\{"status":0\}/);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("命中失败立即退出，不空转到超时", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 3 });
    await expect(
      pollTask(fetch, {
        isDone: (r: any) => r.status === 2,
        isFailed: (r: any) => r.status === 3,
        intervalMs: 0,
        maxAttempts: 30,
        timeoutError,
        failedError: () => new Error("failed"),
      }),
    ).rejects.toThrow("failed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("超时错误携带最后一次响应（保住 err.info() 契约）", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 0, taskId: "t1" });
    await expect(
      pollTask(fetch, {
        isDone: () => false,
        intervalMs: 0,
        maxAttempts: 2,
        timeoutError: (last: any) => new Error(`last=${last.taskId}`),
      }),
    ).rejects.toThrow("last=t1");
  });

  it("attempt 序号从 0 递增（供 quark retry_index 使用）", async () => {
    const seen: number[] = [];
    await pollTask(
      (attempt) => {
        seen.push(attempt);
        return { status: attempt === 2 ? 1 : 0 };
      },
      { isDone: (r: any) => r.status === 1, intervalMs: 0, timeoutError },
    );
    expect(seen).toEqual([0, 1, 2]);
  });

  it("maxAttempts 为 0 时不轮询，直接超时（不会挂起）", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 0 });
    await expect(
      pollTask(fetch, {
        isDone: () => false,
        intervalMs: 0,
        maxAttempts: 0,
        timeoutError,
      }),
    ).rejects.toThrow(/timeout/);
    expect(fetch).not.toHaveBeenCalled();
  });
});