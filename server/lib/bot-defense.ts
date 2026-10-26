import { createHmac, timingSafeEqual } from "crypto";
import { getConfigValue } from "#server/lib/configCache";

/**
 * BOT 防御核心库（纯逻辑，不依赖 h3 / nitro 自动导入，可直接被 vitest 测试）
 *
 * 扩展指引（维护方便的关键）：
 * 1. 新增验证码类型：实现 CaptchaProvider 接口 + registerCaptchaProvider() 注册即可，
 *    后台下拉框 / 前端预览 / 服务端二次校验自动生效。
 *    （前端 CaptchaModal / 后台预览需要同时补一段对应类型的渲染代码）
 * 2. 新增受保护接口：registerProtectedApi() 注册，
 *    再到目标接口 handler 顶部调用 assertBotDefense(event, "路径")。
 * 3. 配置整体以 JSON 存在 Config 表单行（key = bot_defense），与 ad_filter 同一套路。
 */

// ============ 类型定义 ============

/** 验证码配置（"none" 表示关闭防御） */
export type BotDefenseCaptchaType = "none" | "turnstile" | "geetest4" | (string & {});

export interface BotDefenseConfig {
  /** 验证码类型，none=关闭 */
  captchaType: BotDefenseCaptchaType;
  /** 网站密钥：Turnstile SiteKey / 极验 Captcha ID */
  siteKey: string;
  /** 平台密钥：Turnstile SecretKey / 极验 Captcha Key */
  secretKey: string;
  /** 需要人机验证的接口路径（须在注册表中登记） */
  protectedApis: string[];
  /** 验证有效时间（分钟），过期后需重新验证 */
  verifyTtlMinutes: number;
}

export interface CaptchaVerifyInput {
  siteKey: string;
  secretKey: string;
  /** Turnstile 为字符串 token；极验为 { lot_number, captcha_output, pass_token, gen_time } */
  token: unknown;
  remoteIp?: string;
}

export interface CaptchaProvider {
  /** 类型标识，存进配置的 captchaType */
  type: string;
  /** 后台下拉框显示名 */
  label: string;
  /** 前端组件脚本地址（预览 / 弹窗渲染用） */
  scriptUrl: string;
  siteKeyLabel: string;
  secretKeyLabel: string;
  /** 服务端二次校验地址 */
  verifyUrl: string;
  /**
   * 构建二次校验请求；参数不完整时返回 null（直接判定失败，不发网络请求）。
   */
  buildVerifyRequest: (
    input: CaptchaVerifyInput,
  ) => { url: string; init: RequestInit } | null;
  /** 解析校验接口响应，返回是否通过 */
  parseVerifyResult: (json: unknown) => boolean;
}

export interface ProtectedApiEntry {
  path: string;
  label: string;
  description?: string;
}

// ============ 常量与默认值 ============

export const BOT_DEFENSE_CONFIG_KEY = "bot_defense";

export const BOT_DEFENSE_MIN_TTL = 1;
export const BOT_DEFENSE_MAX_TTL = 24 * 60;

export const DEFAULT_BOT_DEFENSE_CONFIG: BotDefenseConfig = {
  captchaType: "none",
  siteKey: "",
  secretKey: "",
  protectedApis: [],
  verifyTtlMinutes: 60,
};

// ============ 验证码 Provider 注册表 ============

const captchaProviders = new Map<string, CaptchaProvider>();

export function registerCaptchaProvider(provider: CaptchaProvider): void {
  if (captchaProviders.has(provider.type)) {
    throw new Error(`[bot-defense] 验证码类型重复注册: ${provider.type}`);
  }
  captchaProviders.set(provider.type, provider);
}

export function getCaptchaProvider(type: string): CaptchaProvider | null {
  return captchaProviders.get(type) ?? null;
}

export function listCaptchaProviders(): CaptchaProvider[] {
  return [...captchaProviders.values()];
}

// —— Cloudflare Turnstile ——
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

registerCaptchaProvider({
  type: "turnstile",
  label: "Cloudflare Turnstile",
  scriptUrl: TURNSTILE_SCRIPT_URL,
  siteKeyLabel: "Site Key（网站密钥）",
  secretKeyLabel: "Secret Key（平台密钥）",
  verifyUrl: TURNSTILE_VERIFY_URL,
  buildVerifyRequest({ siteKey: _siteKey, secretKey, token, remoteIp }) {
    if (typeof token !== "string" || !token) return null;
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    return {
      url: TURNSTILE_VERIFY_URL,
      init: {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    };
  },
  parseVerifyResult(json) {
    return (
      !!json &&
      typeof json === "object" &&
      (json as { success?: unknown }).success === true
    );
  },
});

// —— 极验行为验证 4.0 ——
// 二次校验：POST {verifyUrl}?captcha_id=<id>，form-urlencoded：
//   lot_number / captcha_output / pass_token / gen_time / sign_token
//   sign_token = HMAC-SHA256(lot_number, key=captcha_key) 的 hex
const GEETEST4_SCRIPT_URL = "https://static.geetest.com/v4/gt4.js";
const GEETEST4_VERIFY_URL = "https://gcaptcha4.geetest.com/validate";

const GEETEST4_REQUIRED_FIELDS = [
  "lot_number",
  "captcha_output",
  "pass_token",
  "gen_time",
] as const;

registerCaptchaProvider({
  type: "geetest4",
  label: "极验行为验证 4.0",
  scriptUrl: GEETEST4_SCRIPT_URL,
  siteKeyLabel: "Captcha ID（网站密钥）",
  secretKeyLabel: "Captcha Key（平台密钥）",
  verifyUrl: GEETEST4_VERIFY_URL,
  buildVerifyRequest({ siteKey, secretKey, token }) {
    if (!token || typeof token !== "object") return null;
    const t = token as Record<string, unknown>;
    for (const field of GEETEST4_REQUIRED_FIELDS) {
      if (typeof t[field] !== "string" || !(t[field] as string)) return null;
    }
    const lotNumber = t.lot_number as string;
    const signToken = createHmac("sha256", secretKey)
      .update(lotNumber)
      .digest("hex");
    const body = new URLSearchParams({
      lot_number: lotNumber,
      captcha_output: t.captcha_output as string,
      pass_token: t.pass_token as string,
      gen_time: t.gen_time as string,
      sign_token: signToken,
    });
    return {
      url: `${GEETEST4_VERIFY_URL}?captcha_id=${encodeURIComponent(siteKey)}`,
      init: {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    };
  },
  parseVerifyResult(json) {
    return (
      !!json &&
      typeof json === "object" &&
      (json as { result?: unknown }).result === "success"
    );
  },
});

// ============ 受保护接口注册表 ============

const protectedApiRegistry = new Map<string, ProtectedApiEntry>();

export function registerProtectedApi(entry: ProtectedApiEntry): void {
  if (protectedApiRegistry.has(entry.path)) {
    throw new Error(`[bot-defense] 受保护接口重复注册: ${entry.path}`);
  }
  protectedApiRegistry.set(entry.path, entry);
}

export function listProtectedApis(): ProtectedApiEntry[] {
  return [...protectedApiRegistry.values()];
}

export function isKnownProtectedApi(path: string): boolean {
  return protectedApiRegistry.has(path);
}

// —— 内置受保护接口（后续新增在此登记，并在对应 handler 顶部调用 assertBotDefense）——
registerProtectedApi({
  path: "/api/source/geturl",
  label: "获取下载链接",
  description: "POST /api/source/geturl.ts（网盘转存）",
});
registerProtectedApi({
  path: "/api/source/tree",
  label: "获取目录树",
  description: "GET /api/source/tree.ts（递归拉取网盘目录）",
});
registerProtectedApi({
  path: "/api/ai-search",
  label: "AI 智能搜索",
  description: "POST /api/ai-search.ts（大模型对话式搜索，调用成本高）",
});

// ============ 配置解析与校验 ============

/** 从 Config 表原始字符串解析配置，任何异常都回落到默认值（绝不抛错） */
export function parseBotDefenseConfig(
  raw: string | undefined | null,
): BotDefenseConfig {
  if (!raw) return { ...DEFAULT_BOT_DEFENSE_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_BOT_DEFENSE_CONFIG };
    }
    return normalizeConfigFields(parsed as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_BOT_DEFENSE_CONFIG };
  }
}

function normalizeConfigFields(parsed: Record<string, unknown>): BotDefenseConfig {
  const captchaType =
    typeof parsed.captchaType === "string" && parsed.captchaType
      ? parsed.captchaType
      : DEFAULT_BOT_DEFENSE_CONFIG.captchaType;
  const siteKey = typeof parsed.siteKey === "string" ? parsed.siteKey : "";
  const secretKey =
    typeof parsed.secretKey === "string" ? parsed.secretKey : "";
  const protectedApis = Array.isArray(parsed.protectedApis)
    ? parsed.protectedApis.filter(
        (p): p is string => typeof p === "string" && !!p,
      )
    : [];
  const ttl = parsed.verifyTtlMinutes;
  const verifyTtlMinutes =
    typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0
      ? Math.floor(ttl)
      : DEFAULT_BOT_DEFENSE_CONFIG.verifyTtlMinutes;
  return {
    captchaType,
    siteKey,
    secretKey,
    protectedApis,
    verifyTtlMinutes,
  };
}

export type BotDefenseValidationResult =
  | { ok: true; config: BotDefenseConfig }
  | { ok: false; errors: string[] };

/**
 * 校验后台提交的配置（管理员保存入口，严格模式）。
 * "none" 时不强制密钥；其余类型必须提供网站密钥与平台密钥。
 */
export function validateBotDefenseConfig(
  input: unknown,
): BotDefenseValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["配置格式错误"] };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];

  // 验证码类型
  const captchaTypeRaw = raw.captchaType;
  let captchaType = DEFAULT_BOT_DEFENSE_CONFIG.captchaType;
  if (captchaTypeRaw === undefined || captchaTypeRaw === null) {
    // 容忍缺省，按 none 处理
  } else if (typeof captchaTypeRaw !== "string") {
    errors.push("验证码类型格式错误");
  } else {
    captchaType = captchaTypeRaw.trim();
    if (captchaType !== "none" && !getCaptchaProvider(captchaType)) {
      errors.push(`不支持的验证码类型: ${captchaType}`);
    }
  }

  // 密钥
  const siteKeyRaw = raw.siteKey;
  const secretKeyRaw = raw.secretKey;
  let siteKey = "";
  let secretKey = "";
  if (siteKeyRaw !== undefined && typeof siteKeyRaw !== "string") {
    errors.push("网站密钥格式错误");
  } else {
    siteKey = (siteKeyRaw ?? "").trim();
  }
  if (secretKeyRaw !== undefined && typeof secretKeyRaw !== "string") {
    errors.push("平台密钥格式错误");
  } else {
    secretKey = (secretKeyRaw ?? "").trim();
  }
  if (captchaType !== "none") {
    if (!siteKey) errors.push("启用验证码后必须配置网站密钥");
    if (!secretKey) errors.push("启用验证码后必须配置平台密钥");
  }

  // 受保护接口
  let protectedApis: string[] = [];
  const apisRaw = raw.protectedApis;
  if (apisRaw !== undefined && apisRaw !== null) {
    if (!Array.isArray(apisRaw)) {
      errors.push("受保护接口列表格式错误");
    } else {
      for (const p of apisRaw) {
        if (typeof p !== "string" || !p.trim()) {
          errors.push("受保护接口列表中存在非法项");
          break;
        }
      }
      if (!errors.some((e) => e.startsWith("受保护接口"))) {
        protectedApis = [...new Set(apisRaw.map((p) => (p as string).trim()))];
        const unknown = protectedApis.filter((p) => !isKnownProtectedApi(p));
        if (unknown.length > 0) {
          errors.push(`未登记的接口路径: ${unknown.join("、")}`);
        }
      }
    }
  }

  // 验证有效时间
  const ttlRaw = raw.verifyTtlMinutes;
  let verifyTtlMinutes = DEFAULT_BOT_DEFENSE_CONFIG.verifyTtlMinutes;
  if (ttlRaw !== undefined && ttlRaw !== null) {
    if (
      typeof ttlRaw !== "number" ||
      !Number.isInteger(ttlRaw) ||
      ttlRaw < BOT_DEFENSE_MIN_TTL ||
      ttlRaw > BOT_DEFENSE_MAX_TTL
    ) {
      errors.push(
        `验证有效时间需为 ${BOT_DEFENSE_MIN_TTL}-${BOT_DEFENSE_MAX_TTL} 的整数（分钟）`,
      );
    } else {
      verifyTtlMinutes = ttlRaw;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    config: {
      captchaType,
      siteKey,
      secretKey,
      protectedApis,
      verifyTtlMinutes,
    },
  };
}

/** 读取运行时配置（configCache 带 24h 内存缓存，保存时会同步刷新） */
export async function getBotDefenseConfig(): Promise<BotDefenseConfig> {
  return parseBotDefenseConfig(
    await getConfigValue(BOT_DEFENSE_CONFIG_KEY),
  );
}

// ============ 通行令牌（验证通过后的短期通行证） ============

/**
 * 签名密钥：复用后台 ADMIN_SECRET，不额外增加环境变量。
 * 令牌格式：base64url(payload).base64url(hmac-sha256(payload))
 */
export function getBotDefenseSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error(
      "[bot-defense] ADMIN_SECRET 环境变量未设置，请在 .env 或部署环境中配置",
    );
  }
  return secret;
}

const safeEqualStr = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // 保持恒定时间语义：长度不等时也做一次比较，防止通过耗时推测
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
};

/** 签发通行令牌，ttlMinutes 分钟内有效 */
export function issueCaptchaPassToken(
  ttlMinutes: number,
  secret: string,
  now = Date.now(),
): string {
  const payload = { v: 1, iat: now, exp: now + ttlMinutes * 60_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** 校验通行令牌（签名 + 过期时间） */
export function verifyCaptchaPassToken(
  token: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [body, sig] = parts;

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqualStr(sig, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload?.v !== 1 || typeof payload.exp !== "number") return false;
    return payload.exp > now;
  } catch {
    return false;
  }
}

// ============ 服务端二次校验（Provider 网络） ============

/** 调用验证码平台的二次校验接口，fetchImpl 可注入便于测试 */
export async function verifyCaptchaToken(
  provider: CaptchaProvider,
  input: CaptchaVerifyInput,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const req = provider.buildVerifyRequest(input);
  if (!req) return false;
  try {
    const res = await fetchImpl(req.url, req.init);
    if (!res.ok) return false;
    return provider.parseVerifyResult(await res.json());
  } catch (err) {
    console.error(`[bot-defense] ${provider.type} 二次校验请求失败:`, err);
    return false;
  }
}

// ============ 闸门判定（纯函数） ============

export interface BotDefenseCheckInput {
  apiPath: string;
  /** 请求头 x-captcha-pass 的值 */
  captchaPass?: string;
  /** 通行令牌签名密钥 */
  secret: string;
  now?: number;
}

export type BotDefenseCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "captcha_required";
      captchaType: string;
      siteKey: string;
    };

/** 判定一次受保护接口请求是否放行（管理员放行逻辑在胶水层处理） */
export function evaluateBotDefense(
  config: BotDefenseConfig,
  input: BotDefenseCheckInput,
): BotDefenseCheckResult {
  if (config.captchaType === "none") return { ok: true };
  if (!config.protectedApis.includes(input.apiPath)) return { ok: true };

  if (
    input.captchaPass &&
    verifyCaptchaPassToken(
      input.captchaPass,
      input.secret,
      input.now ?? Date.now(),
    )
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "captcha_required",
    captchaType: config.captchaType,
    siteKey: config.siteKey,
  };
}
