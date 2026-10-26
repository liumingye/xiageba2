import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BOT 防御核心库测试
 *
 * 覆盖：配置解析/校验、注册表、通行令牌、Provider 二次校验（stub fetch）、闸门判定
 * server/utils/bot-defense.ts（assertBotDefense 胶水）仅做头提取与错误包装，
 * 不在本文件测试范围。
 */

const h = vi.hoisted(() => ({
  rawConfig: "",
}));

vi.mock("#server/lib/configCache", () => ({
  getConfigValue: vi.fn(async () => h.rawConfig),
}));

process.env.ADMIN_SECRET ||= "bot-defense-test-secret";

const {
  BOT_DEFENSE_CONFIG_KEY,
  DEFAULT_BOT_DEFENSE_CONFIG,
  parseBotDefenseConfig,
  validateBotDefenseConfig,
  getBotDefenseConfig,
  getCaptchaProvider,
  listCaptchaProviders,
  registerCaptchaProvider,
  listProtectedApis,
  registerProtectedApi,
  isKnownProtectedApi,
  issueCaptchaPassToken,
  verifyCaptchaPassToken,
  getBotDefenseSecret,
  verifyCaptchaToken,
  evaluateBotDefense,
} = await import("./bot-defense");

beforeEach(() => {
  h.rawConfig = "";
});

// ============ 配置解析 ============

describe("parseBotDefenseConfig 容错解析", () => {
  it("空值回落默认配置", () => {
    for (const raw of [undefined, null, ""]) {
      expect(parseBotDefenseConfig(raw)).toEqual(DEFAULT_BOT_DEFENSE_CONFIG);
    }
  });

  it("非法 JSON 回落默认配置", () => {
    expect(parseBotDefenseConfig("{oops")).toEqual(DEFAULT_BOT_DEFENSE_CONFIG);
    expect(parseBotDefenseConfig("[1,2]")).toEqual(DEFAULT_BOT_DEFENSE_CONFIG);
    expect(parseBotDefenseConfig('"str"')).toEqual(DEFAULT_BOT_DEFENSE_CONFIG);
  });

  it("正常解析完整配置", () => {
    const raw = JSON.stringify({
      captchaType: "geetest4",
      siteKey: "FCxxx",
      secretKey: "key",
      protectedApis: ["/api/source/geturl"],
      verifyTtlMinutes: 120,
    });
    expect(parseBotDefenseConfig(raw)).toEqual({
      captchaType: "geetest4",
      siteKey: "FCxxx",
      secretKey: "key",
      protectedApis: ["/api/source/geturl"],
      verifyTtlMinutes: 120,
    });
  });

  it("部分字段缺失/类型错误时逐字段兜底", () => {
    const parsed = parseBotDefenseConfig(
      JSON.stringify({
        captchaType: "turnstile",
        protectedApis: ["/api/source/tree", 42, ""],
        verifyTtlMinutes: 30.7,
      }),
    );
    expect(parsed.captchaType).toBe("turnstile");
    expect(parsed.siteKey).toBe("");
    expect(parsed.secretKey).toBe("");
    // 非字符串项被过滤；小数 TTL 向下取整
    expect(parsed.protectedApis).toEqual(["/api/source/tree"]);
    expect(parsed.verifyTtlMinutes).toBe(30);
  });
});

// ============ 配置校验（后台保存入口） ============

describe("validateBotDefenseConfig 严格校验", () => {
  it("合法配置通过并归一化（trim + 去重）", () => {
    const result = validateBotDefenseConfig({
      captchaType: " geetest4 ",
      siteKey: "  captcha-id  ",
      secretKey: " captcha-key ",
      protectedApis: [
        "/api/source/geturl",
        "/api/source/geturl",
        "/api/source/tree",
      ],
      verifyTtlMinutes: 90,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual({
        captchaType: "geetest4",
        siteKey: "captcha-id",
        secretKey: "captcha-key",
        protectedApis: ["/api/source/geturl", "/api/source/tree"],
        verifyTtlMinutes: 90,
      });
    }
  });

  it("none 类型不要求密钥，缺省字段取默认值", () => {
    const result = validateBotDefenseConfig({ captchaType: "none" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.captchaType).toBe("none");
      expect(result.config.verifyTtlMinutes).toBe(
        DEFAULT_BOT_DEFENSE_CONFIG.verifyTtlMinutes,
      );
      expect(result.config.protectedApis).toEqual([]);
    }
  });

  it("未登记的验证码类型被拒绝", () => {
    const result = validateBotDefenseConfig({
      captchaType: "recaptcha",
      siteKey: "a",
      secretKey: "b",
      protectedApis: [],
      verifyTtlMinutes: 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("不支持的验证码类型");
    }
  });

  it("启用验证码但缺少密钥时报错", () => {
    const result = validateBotDefenseConfig({
      captchaType: "turnstile",
      siteKey: "",
      secretKey: "",
      protectedApis: [],
      verifyTtlMinutes: 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("启用验证码后必须配置网站密钥");
      expect(result.errors).toContain("启用验证码后必须配置平台密钥");
    }
  });

  it("受保护接口含未登记路径时报错", () => {
    const result = validateBotDefenseConfig({
      captchaType: "none",
      protectedApis: ["/api/other/endpoint"],
      verifyTtlMinutes: 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("未登记的接口路径");
    }
  });

  it("受保护接口列表含非法项时报错", () => {
    const result = validateBotDefenseConfig({
      captchaType: "none",
      protectedApis: ["/api/source/geturl", 123],
      verifyTtlMinutes: 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("非法项");
    }
  });

  it("受保护接口非数组时报错", () => {
    const result = validateBotDefenseConfig({
      captchaType: "none",
      protectedApis: "/api/source/geturl",
      verifyTtlMinutes: 60,
    });
    expect(result.ok).toBe(false);
  });

  it("TTL 越界 / 非整数 / 非数字均报错（null 视为缺省，取默认值）", () => {
    for (const ttl of [0, -5, 1441, 1.5, "60"]) {
      const result = validateBotDefenseConfig({
        captchaType: "none",
        verifyTtlMinutes: ttl,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join()).toContain("验证有效时间");
      }
    }
  });

  it("TTL 边界值 1 与 1440 合法", () => {
    for (const ttl of [1, 1440]) {
      expect(
        validateBotDefenseConfig({
          captchaType: "none",
          verifyTtlMinutes: ttl,
        }).ok,
      ).toBe(true);
    }
  });

  it("非对象输入报错", () => {
    expect(validateBotDefenseConfig(null).ok).toBe(false);
    expect(validateBotDefenseConfig("x").ok).toBe(false);
    expect(validateBotDefenseConfig([1]).ok).toBe(false);
  });
});

// ============ 运行时配置读取 ============

describe("getBotDefenseConfig", () => {
  it("从 configCache 读取并解析 JSON", async () => {
    h.rawConfig = JSON.stringify({
      captchaType: "turnstile",
      siteKey: "sk",
      secretKey: "sec",
      protectedApis: ["/api/source/geturl"],
      verifyTtlMinutes: 30,
    });
    const config = await getBotDefenseConfig();
    expect(config.captchaType).toBe("turnstile");
    expect(config.verifyTtlMinutes).toBe(30);
  });

  it("配置损坏时回落默认值", async () => {
    h.rawConfig = "broken-json";
    const config = await getBotDefenseConfig();
    expect(config).toEqual(DEFAULT_BOT_DEFENSE_CONFIG);
  });
});

// ============ 注册表 ============

describe("注册表", () => {
  it("内置 Turnstile 与极验 4.0 已注册", () => {
    const types = listCaptchaProviders().map((p) => p.type);
    expect(types).toContain("turnstile");
    expect(types).toContain("geetest4");
    expect(getCaptchaProvider("turnstile")?.label).toContain("Turnstile");
    expect(getCaptchaProvider("geetest4")?.label).toContain("极验");
    expect(getCaptchaProvider("unknown")).toBeNull();
  });

  it("重复注册验证码类型抛错", () => {
    expect(() =>
      registerCaptchaProvider({
        type: "turnstile",
        label: "dup",
        scriptUrl: "",
        siteKeyLabel: "",
        secretKeyLabel: "",
        verifyUrl: "",
        buildVerifyRequest: () => null,
        parseVerifyResult: () => false,
      }),
    ).toThrow();
  });

  it("内置受保护接口已登记，重复注册抛错", () => {
    const paths = listProtectedApis().map((a) => a.path);
    expect(paths).toContain("/api/source/geturl");
    expect(paths).toContain("/api/source/tree");
    expect(paths).toContain("/api/ai-search");
    expect(isKnownProtectedApi("/api/source/geturl")).toBe(true);
    expect(isKnownProtectedApi("/api/ai-search")).toBe(true);
    expect(isKnownProtectedApi("/api/unknown")).toBe(false);

    expect(() =>
      registerProtectedApi({ path: "/api/source/geturl", label: "dup" }),
    ).toThrow();
  });
});

// ============ 通行令牌 ============

describe("通行令牌", () => {
  const secret = "unit-test-secret";

  it("签发后可校验通过", () => {
    const token = issueCaptchaPassToken(60, secret);
    expect(verifyCaptchaPassToken(token, secret)).toBe(true);
  });

  it("过期后校验失败（到期时刻即失效，严格大于才有效）", () => {
    const now = Date.now();
    const token = issueCaptchaPassToken(1, secret, now);
    expect(verifyCaptchaPassToken(token, secret, now + 59_999)).toBe(true);
    expect(verifyCaptchaPassToken(token, secret, now + 60_000)).toBe(false);
    expect(verifyCaptchaPassToken(token, secret, now + 60_001)).toBe(false);
  });

  it("篡改 payload / 签名后校验失败", () => {
    const token = issueCaptchaPassToken(60, secret);
    const [body, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, iat: 0, exp: Date.now() + 9_999_999 }),
    ).toString("base64url");
    expect(verifyCaptchaPassToken(`${forgedPayload}.${sig}`, secret)).toBe(
      false,
    );
    expect(verifyCaptchaPassToken(`${body}.${"A".repeat(sig.length)}`, secret)).toBe(
      false,
    );
  });

  it("密钥不匹配 / 格式非法时校验失败", () => {
    const token = issueCaptchaPassToken(60, secret);
    expect(verifyCaptchaPassToken(token, "wrong-secret")).toBe(false);
    expect(verifyCaptchaPassToken("", secret)).toBe(false);
    expect(verifyCaptchaPassToken("a.b.c", secret)).toBe(false);
    expect(verifyCaptchaPassToken("only-one-part", secret)).toBe(false);
  });

  it("getBotDefenseSecret 未配置 ADMIN_SECRET 时抛错", () => {
    const backup = process.env.ADMIN_SECRET;
    delete process.env.ADMIN_SECRET;
    try {
      expect(() => getBotDefenseSecret()).toThrow();
    } finally {
      if (backup !== undefined) process.env.ADMIN_SECRET = backup;
    }
  });
});

// ============ Provider 二次校验 ============

describe("verifyCaptchaToken（stub fetch）", () => {
  it("Turnstile：token 非字符串直接失败，不发网络请求", async () => {
    const fetchImpl = vi.fn();
    const provider = getCaptchaProvider("turnstile")!;
    const ok = await verifyCaptchaToken(
      provider,
      { siteKey: "site", secretKey: "sec", token: 123 },
      fetchImpl as unknown as typeof fetch,
    );
    expect(ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Turnstile：携带 secret/response/remoteip，成功解析 success", async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({ ok: true, json: async () => ({ success: true }) }) as Response,
    );
    const provider = getCaptchaProvider("turnstile")!;
    const ok = await verifyCaptchaToken(
      provider,
      {
        siteKey: "site-key",
        secretKey: "sec-key",
        token: "user-token",
        remoteIp: "1.2.3.4",
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    const body = String(init.body);
    expect(body).toContain("secret=sec-key");
    expect(body).toContain("response=user-token");
    expect(body).toContain("remoteip=1.2.3.4");
  });

  it("Turnstile：success=false / 非 200 / 网络异常均失败", async () => {
    const provider = getCaptchaProvider("turnstile")!;
    const input = {
      siteKey: "site",
      secretKey: "sec",
      token: "tok",
    };
    expect(
      await verifyCaptchaToken(
        provider,
        input,
        (async () => ({ ok: true, json: async () => ({ success: false }) })) as unknown as typeof fetch,
      ),
    ).toBe(false);
    expect(
      await verifyCaptchaToken(
        provider,
        input,
        (async () => ({ ok: false })) as unknown as typeof fetch,
      ),
    ).toBe(false);
    expect(
      await verifyCaptchaToken(
        provider,
        input,
        (async () => {
          throw new Error("network down");
        }) as unknown as typeof fetch,
      ),
    ).toBe(false);
  });

  it("极验 4.0：缺任一必需字段直接失败，不发网络请求", async () => {
    const fetchImpl = vi.fn();
    const provider = getCaptchaProvider("geetest4")!;
    const ok = await verifyCaptchaToken(
      provider,
      {
        siteKey: "captcha-id",
        secretKey: "captcha-key",
        token: { lot_number: "l", captcha_output: "c", pass_token: "p" },
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("极验 4.0：sign_token 计算正确且 result=success 判定通过", async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({ ok: true, json: async () => ({ result: "success" }) }) as Response,
    );
    const provider = getCaptchaProvider("geetest4")!;
    const token = {
      lot_number: "lot-123",
      captcha_output: "output",
      pass_token: "pass",
      gen_time: "1698000000",
    };
    const ok = await verifyCaptchaToken(
      provider,
      { siteKey: "captcha-id", secretKey: "captcha-key", token },
      fetchImpl as unknown as typeof fetch,
    );
    expect(ok).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://gcaptcha4.geetest.com/validate?captcha_id=captcha-id",
    );
    const body = new URLSearchParams(String(init.body));
    expect(body.get("lot_number")).toBe("lot-123");
    expect(body.get("captcha_output")).toBe("output");
    expect(body.get("pass_token")).toBe("pass");
    expect(body.get("gen_time")).toBe("1698000000");
    // 官方规则：HMAC-SHA256(lot_number, key=captcha_key) 的 hex
    const expectedSign = createHmac("sha256", "captcha-key")
      .update("lot-123")
      .digest("hex");
    expect(body.get("sign_token")).toBe(expectedSign);
  });

  it("极验 4.0：result=fail 判定失败", async () => {
    const provider = getCaptchaProvider("geetest4")!;
    const ok = await verifyCaptchaToken(
      provider,
      {
        siteKey: "captcha-id",
        secretKey: "captcha-key",
        token: {
          lot_number: "l",
          captcha_output: "c",
          pass_token: "p",
          gen_time: "1",
        },
      },
      (async () =>
        ({ ok: true, json: async () => ({ result: "fail" }) }) as Response) as unknown as typeof fetch,
    );
    expect(ok).toBe(false);
  });
});

// ============ 闸门判定 ============

describe("evaluateBotDefense", () => {
  const secret = "gate-secret";
  const baseConfig = {
    captchaType: "turnstile",
    siteKey: "site-key",
    secretKey: "sec",
    protectedApis: ["/api/source/geturl"],
    verifyTtlMinutes: 60,
  };

  it("验证码类型为 none 时直接放行", () => {
    expect(
      evaluateBotDefense(
        { ...baseConfig, captchaType: "none" },
        { apiPath: "/api/source/geturl", captchaPass: "", secret },
      ),
    ).toEqual({ ok: true });
  });

  it("接口不在保护列表时放行", () => {
    expect(
      evaluateBotDefense(baseConfig, {
        apiPath: "/api/source/tree",
        captchaPass: "",
        secret,
      }),
    ).toEqual({ ok: true });
  });

  it("受保护接口无通行令牌时返回 captcha_required 及渲染信息", () => {
    const result = evaluateBotDefense(baseConfig, {
      apiPath: "/api/source/geturl",
      captchaPass: "",
      secret,
    });
    expect(result).toEqual({
      ok: false,
      reason: "captcha_required",
      captchaType: "turnstile",
      siteKey: "site-key",
    });
  });

  it("携带有效通行令牌时放行", () => {
    const pass = issueCaptchaPassToken(30, secret);
    expect(
      evaluateBotDefense(baseConfig, {
        apiPath: "/api/source/geturl",
        captchaPass: pass,
        secret,
      }),
    ).toEqual({ ok: true });
  });

  it("通行令牌过期后要求重新验证", () => {
    const now = Date.now();
    const pass = issueCaptchaPassToken(10, secret, now);
    const result = evaluateBotDefense(baseConfig, {
      apiPath: "/api/source/geturl",
      captchaPass: pass,
      secret,
      now: now + 10 * 60_000 + 1,
    });
    expect(result.ok).toBe(false);
  });

  it("通行令牌用错误密钥签发时要求重新验证", () => {
    const forged = issueCaptchaPassToken(10, "other-secret");
    const result = evaluateBotDefense(baseConfig, {
      apiPath: "/api/source/geturl",
      captchaPass: forged,
      secret,
    });
    expect(result.ok).toBe(false);
  });
});
