import { describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { GuangyaClient } from "@netdisk-sdk/guangya-sdk";
import { C139Client, C139_SHARE_AES_KEY } from "@netdisk-sdk/c139-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";

// superagent 只安装在各 SDK 包内，从 SDK 目录解析才能拿到 fs_openapi 用的同一实例
const superagent = createRequire(
  new URL(
    "../../packages/netdisk-sdk-js/packages/baidu-sdk/package.json",
    import.meta.url,
  ),
)("superagent");

interface IStubCall {
  method: string;
  url: string;
  payload: any;
  at: number;
  buffered?: boolean;
}

/** 用假请求替换 agent 的 post/get，await 时才记为一次真实发出 */
const stubAgent = (
  agent: any,
  handler: (url: string, payload: any) => any,
): IStubCall[] => {
  const calls: IStubCall[] = [];
  const make = (method: string) => (url: string) => {
    let payload: any;
    let buffered: boolean | undefined;
    const req: any = {
      set: () => req,
      query: () => req,
      type: () => req,
      parse: () => req,
      buffer: (value: boolean) => {
        buffered = value;
        return req;
      },
      timeout: () => req,
      send: (body: any) => {
        payload = body;
        return req;
      },
      then: (onOk: any, onErr: any) => {
        calls.push({ method, url, payload, at: Date.now(), buffered });
        return Promise.resolve()
          .then(() => handler(url, payload))
          .then(onOk, onErr);
      },
    };
    return req;
  };
  agent.post = make("POST");
  agent.get = make("GET");
  return calls;
};

const tokenBody = (n: number) => ({
  body: {
    access_token: `at-${n}`,
    refresh_token: `rt-${n}`,
    expires_in: 3600,
  },
});

describe("令牌刷新单飞", () => {
  it("迅雷：并发取 token 只刷新一次", async () => {
    const client = new XunleiClient({ refreshToken: "rt-0" });
    let n = 0;
    const calls = stubAgent(client.agent, () => tokenBody(++n));

    const tokens = await Promise.all(
      Array.from({ length: 5 }, () => client.getAccessToken()),
    );

    expect(calls.length).toBe(1);
    expect(new Set(tokens).size).toBe(1);
    expect(tokens[0]).toBe("at-1");
    // 轮换后的 refresh_token 必须落回 config，否则下次刷新用的是已作废的旧值
    expect(client.config.refreshToken).toBe("rt-1");
  });

  it("迅雷：刷新失败后释放单飞锁，下次调用重新发起", async () => {
    const client = new XunleiClient({ refreshToken: "rt-0" });
    let fail = true;
    let n = 0;
    stubAgent(client.agent, () => {
      if (fail) throw new Error("refresh boom");
      return tokenBody(++n);
    });

    await expect(
      Promise.all([client.getAccessToken(), client.getAccessToken()]),
    ).rejects.toThrow("refresh boom");

    fail = false;
    await expect(client.getAccessToken()).resolves.toBe("at-1");
  });

  it("光鸭：并发 ensureAccessToken 只刷新一次", async () => {
    const client = new GuangyaClient({ refreshToken: "rt-0" });
    let n = 0;
    const calls = stubAgent(client.agent, () => tokenBody(++n));

    const tokens = await Promise.all(
      Array.from({ length: 4 }, () => client.ensureAccessToken()),
    );

    expect(calls.length).toBe(1);
    expect(tokens.every((t) => t === "at-1")).toBe(true);
    expect(client.getCredential().refreshToken).toBe("rt-1");
  });

  it("百度：并发 ensureToken 只刷新一次（refresh_token 会轮换）", async () => {
    const client = new BaiduClient({
      source: "BDUSS=b",
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "rt-0",
    });

    let n = 0;
    // fs_openapi.refreshToken 内部自建 superagent.agent()，只能从模块级替换
    const spy = vi.spyOn(superagent, "agent").mockReturnValue({
      get: () => {
        const req: any = {
          timeout: () => req,
          query: () => req,
          then: (onOk: any, onErr: any) =>
            Promise.resolve()
              .then(() => tokenBody(++n))
              .then(onOk, onErr),
        };
        return req;
      },
    } as any);

    try {
      await Promise.all([
        client.fsOpenApi.ensureToken(),
        client.fsOpenApi.ensureToken(),
        client.fsOpenApi.ensureToken(),
      ]);
      expect(n).toBe(1);
      expect(client.accessToken).toBe("at-1");
      expect(client.refreshToken).toBe("rt-1");
      expect(client.expiresAt).toBeGreaterThan(Date.now());
    } finally {
      spy.mockRestore();
    }
  });
});

describe("任务轮询", () => {
  it("迅雷：到达次数上限即停，且最后一次尝试后不再多睡一个间隔", async () => {
    const client = new XunleiClient({ refreshToken: "rt" });
    let n = 0;
    client.shareApi.getTask = async () => {
      n++;
      return { progress: 0 };
    };

    const startedAt = Date.now();
    const err = await client.shareApi
      .waitTask("task-1", { maxAttempts: 3, intervalMs: 100 })
      .catch((e) => e);
    const elapsed = Date.now() - startedAt;

    expect(n).toBe(3);
    expect(err.message).toMatch(/timed out/);
    expect(err.info().taskId).toBe("task-1");
    // 3 次尝试只应睡 2 次（旧实现睡 3 次 ≈ 300ms）
    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(elapsed).toBeLessThan(280);
  });

  it("迅雷：完成后立即返回，不追加等待", async () => {
    const client = new XunleiClient({ refreshToken: "rt" });
    client.shareApi.getTask = async () => ({
      progress: 100,
      params: { trace_file_ids: '{"a":"fid-1"}' },
    });

    const startedAt = Date.now();
    const task = await client.shareApi.waitTask("task-2", { intervalMs: 1000 });

    expect(task.progress).toBe(100);
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(client.shareApi.extractTraceFileIds(task.params?.trace_file_ids)).toEqual([
      "fid-1",
    ]);
  });

  it("光鸭：任务失败立即抛错，不再空转到超时", async () => {
    const client = new GuangyaClient({ refreshToken: "rt" });
    let n = 0;
    client.postJSON = async () => {
      n++;
      return { data: { status: "3" }, msg: "转存失败" };
    };

    await expect(client.shareApi.waitTask("task-3")).rejects.toThrow("转存失败");
    expect(n).toBe(1);
  });

  it("c139：按间隔轮询到完成", async () => {
    const client = new C139Client({ cookie: "authorization=Basic x" });
    let n = 0;
    client.shareApi.queryTransferTask = async () => {
      n++;
      return {
        done: n >= 2,
        mapping: { contentIds: [], catalogIds: [] },
        raw: {},
      };
    };

    const startedAt = Date.now();
    const result = await client.shareApi.waitTransferTask("task-4");
    const elapsed = Date.now() - startedAt;

    expect(result.done).toBe(true);
    expect(n).toBe(2);
    expect(elapsed).toBeGreaterThanOrEqual(950);
    expect(elapsed).toBeLessThan(1800);
  });

  it("夸克：_await 轮询到任务结束", async () => {
    const client = new QuarkUCClient({ type: "quark", cookie: "__puus=p" });
    let n = 0;
    stubAgent(client.agentApi, () => {
      n++;
      return { body: { data: { status: n >= 2 ? 2 : 0 } } };
    });

    const startedAt = Date.now();
    const result = await client.fsApi.task("task-5", true);
    const elapsed = Date.now() - startedAt;

    expect(n).toBe(2);
    expect(result.status).toBe(2);
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(elapsed).toBeLessThan(900);
  });

  it("夸克：不带 _await 只查一次", async () => {
    const client = new QuarkUCClient({ type: "quark", cookie: "__puus=p" });
    const calls = stubAgent(client.agentApi, () => ({
      body: { data: { status: 0 } },
    }));

    const result = await client.fsApi.task("task-6");

    expect(calls.length).toBe(1);
    expect(result.status).toBe(0);
  });
});

describe("光鸭任务状态判定", () => {
  const statusOf = async (payload: any) => {
    const client = new GuangyaClient({ refreshToken: "rt" });
    client.postJSON = async () => payload;
    return client.shareApi.taskStatus("t");
  };

  it("字符串状态值也能判定完成/失败", async () => {
    expect(await statusOf({ data: { status: "2" } })).toMatchObject({
      done: true,
      failed: false,
    });
    expect(await statusOf({ data: { status: "3" } })).toMatchObject({
      done: false,
      failed: true,
    });
  });

  it("数值状态值保持原有语义", async () => {
    expect(await statusOf({ data: { status: 2 } })).toMatchObject({ done: true });
    expect(await statusOf({ data: { status: 1 } })).toMatchObject({
      done: false,
      failed: false,
    });
  });

  it("进行中响应带描述性 msg 时不被误判为接口失败", async () => {
    expect(await statusOf({ data: { status: 1 }, msg: "处理中" })).toMatchObject({
      done: false,
      failed: false,
    });
  });

  it("响应缺少 data 但判定成功时不抛错", async () => {
    expect(await statusOf({ success: true })).toMatchObject({
      done: false,
      failed: false,
    });
  });

  it("取不到状态值且响应非成功时立即抛错，不空转到超时", async () => {
    const client = new GuangyaClient({ refreshToken: "rt" });
    let n = 0;
    client.postJSON = async () => {
      n++;
      return { code: 500, msg: "配额不足" };
    };

    await expect(client.shareApi.waitTask("t")).rejects.toThrow(
      /^配额不足; body=/,
    );
    expect(n).toBe(1);
  });
});

describe("光鸭请求节流", () => {
  it("并发请求串行排队，相邻请求间隔不小于节流窗口", async () => {
    const client = new GuangyaClient({ refreshToken: "rt" });
    const calls = stubAgent(client.agentApi, () => ({ body: { success: true } }));

    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        client.postJSONAnonymous(`https://example.test/ep${i}`),
      ),
    );

    expect(calls.length).toBe(4);
    for (let i = 1; i < calls.length; i++) {
      // 节流窗口 50-100ms，留出定时器精度余量
      expect(calls[i].at - calls[i - 1].at).toBeGreaterThanOrEqual(45);
    }
  });
});

describe("c139 分享响应解码", () => {
  const aesEncrypt = (plain: string) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-128-cbc",
      Buffer.from(C139_SHARE_AES_KEY, "utf-8"),
      iv,
    );
    return Buffer.concat([
      iv,
      cipher.update(plain, "utf-8"),
      cipher.final(),
    ]).toString("base64");
  };

  const postWith = (body: string) => {
    const client = new C139Client({ cookie: "authorization=Basic x" });
    stubAgent(client.agent, () => ({ body }));
    return client.sharePost("https://example.test/share", "{}");
  };

  it("密文响应正常解密", async () => {
    const payload = { success: true, data: { caLst: [{ fid: "1" }] } };
    await expect(postWith(aesEncrypt(JSON.stringify(payload)))).resolves.toEqual(
      payload,
    );
  });

  it("明文 JSON 响应按原样解析", async () => {
    const payload = { success: true, resultCode: "0" };
    await expect(postWith(JSON.stringify(payload))).resolves.toEqual(payload);
  });

  it("无法解码时抛错，而不是返回 {} 被判成成功", async () => {
    const err = await postWith("<html>502 Bad Gateway</html>").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/not valid JSON/);
    expect(err.info().body).toContain("502 Bad Gateway");
  });

  it("自定义 parser 显式声明 buffer(true)，避免 superagent 逐请求告警", async () => {
    const client = new C139Client({ cookie: "authorization=Basic x" });
    const calls = stubAgent(client.agent, () => ({ body: "{}" }));
    await client.sharePost("https://example.test/share", "{}");
    expect(calls[0].buffered).toBe(true);
  });
});

describe("夸克登录态隔离", () => {
  it("OSS 直传与业务接口使用不同 agent", () => {
    const client = new QuarkUCClient({ type: "quark", cookie: "__puus=p" });
    expect(client.agent).not.toBe(client.agentApi);
  });

  it("updateCookie 同名键覆盖而非追加", () => {
    const client = new QuarkUCClient({
      type: "quark",
      cookie: "__puus=old; __pus=keep",
    });
    client.updateCookie("__puus=new");
    expect(client.config.cookie).toBe("__puus=new; __pus=keep");
  });
});