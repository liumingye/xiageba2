import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import "dotenv/config";

/** access token 有效期（秒）：1 小时 */
export const ACCESS_TOKEN_TTL = 60 * 60;

/** refresh token 有效期（秒）：7 天 */
export const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7;

export type TokenType = "access" | "refresh";

/** 登录 / 刷新接口返回的令牌组 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** access token 有效期（秒） */
  expiresIn: number;
  /** refresh token 剩余有效期（秒），绝对过期，不随刷新延长 */
  refreshExpiresIn: number;
}

export interface VerifiedToken {
  username: string;
  /** 过期时间（秒级时间戳） */
  exp: number;
  jti: string;
}

const getSecret = (): string => {
  const SECRET = process.env.ADMIN_SECRET;
  if (!SECRET) {
    throw new Error(
      "[auth] ADMIN_SECRET 环境变量未设置，请在 .env 或部署环境中配置",
    );
  }
  return SECRET;
};

/**
 * refresh token 使用由 ADMIN_SECRET 派生的独立密钥。
 * 这样两种令牌互不通用：拿 refresh token 冒充 access token 会先撞上密钥不匹配，
 * payload 里的 typ 是第二道闸。派生而非新增环境变量，避免部署时多一项必填。
 */
const getRefreshSecret = (): string =>
  createHmac("sha256", getSecret()).update("admin-refresh-token").digest("hex");

const secretFor = (type: TokenType): string =>
  type === "refresh" ? getRefreshSecret() : getSecret();

// JWT base64url 编码
const base64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString("base64url");

const base64urlDecode = (str: string): string =>
  Buffer.from(str, "base64url").toString();

/**
 * 真正安全的恒定时间比较（Timing-Safe Equal）
 * crypto.timingSafeEqual 要求传入的两个 Buffer 长度必须完全一致，否则会抛错。
 * 因此这里在内部对长度做了安全置换处理。
 */
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  // 如果长度不相等，依然使用 timingSafeEqual 比较相同的 buffer，但最终返回 false
  // 这样既防止了通过耗时推测出字符串长度，又避免了驱动层抛出 Error 导致程序崩溃
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
};

/**
 * 签发令牌
 * @param ttlSeconds 相对有效期（秒），未指定 expOverride 时生效
 * @param expOverride 绝对过期时间（秒级时间戳），用于轮转 refresh 时继承原会话的过期点
 */
const signToken = (
  username: string,
  type: TokenType,
  ttlSeconds: number,
  expOverride?: number,
): string => {
  const now = Math.floor(Date.now() / 1000);

  // 动态生成 Header 确保标准的结构
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const payload = base64url(
    JSON.stringify({
      sub: username,
      typ: type,
      iat: now, // JWT 规范推荐使用秒级时间戳
      exp: expOverride ?? now + ttlSeconds,
      jti: randomBytes(16).toString("hex"),
    }),
  );

  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secretFor(type))
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
};

/** 签发 access token（1 小时） */
export const generateAccessToken = (username: string): string =>
  signToken(username, "access", ACCESS_TOKEN_TTL);

/** 签发 refresh token（7 天） */
export const generateRefreshToken = (username: string): string =>
  signToken(username, "refresh", REFRESH_TOKEN_TTL);

/** 校验并解出完整载荷，失败返回 null */
export const verifyTokenDetailed = (
  token: string,
  expectedType: TokenType,
): VerifiedToken | null => {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;

  try {
    // 1. 校验 Header 的算法（防御 "alg": "none" 攻击或算法欺骗）
    const headerObj = JSON.parse(base64urlDecode(header));
    if (headerObj.alg !== "HS256") return null;

    // 2. 验证签名（密钥按令牌类型区分）
    const signingInput = `${header}.${payload}`;
    const expectedSignature = createHmac("sha256", secretFor(expectedType))
      .update(signingInput)
      .digest("base64url");

    if (!safeEqual(signature, expectedSignature)) return null;

    // 3. 校验 Payload 内容与过期时间
    const decoded = JSON.parse(base64urlDecode(payload));
    if (decoded.typ !== expectedType) return null;
    if (typeof decoded.sub !== "string" || !decoded.sub) return null;

    const currentTimestamp = Math.floor(Date.now() / 1000);

    // 允许 60 秒的时钟漂移误差
    const CLOCK_SKEW = 60;
    if (typeof decoded.exp !== "number") return null;
    if (decoded.exp < currentTimestamp - CLOCK_SKEW) return null;

    return {
      username: decoded.sub,
      exp: decoded.exp,
      jti: typeof decoded.jti === "string" ? decoded.jti : "",
    };
  } catch {
    return null;
  }
};

/**
 * 校验令牌
 * @param expectedType 期望类型，默认 access。refresh token 不可用于访问后台接口。
 */
export const verifyToken = (
  token: string,
  expectedType: TokenType = "access",
): { username: string } | null => {
  const decoded = verifyTokenDetailed(token, expectedType);
  return decoded ? { username: decoded.username } : null;
};

/** 登录成功后签发的令牌组 */
export const issueTokens = (username: string): TokenPair => ({
  accessToken: generateAccessToken(username),
  refreshToken: generateRefreshToken(username),
  expiresIn: ACCESS_TOKEN_TTL,
  refreshExpiresIn: REFRESH_TOKEN_TTL,
});

/**
 * 用 refresh token 换一组新令牌（轮转）
 *
 * 新 refresh token 继承原会话的绝对过期点：7 天内持续活跃可以一直续，
 * 超过 7 天必须重新登录。这样既不会每小时踢人，也不会让会话无限延长。
 */
export const rotateTokens = (refreshToken: string): TokenPair | null => {
  const verified = verifyTokenDetailed(refreshToken, "refresh");
  if (!verified) return null;

  const now = Math.floor(Date.now() / 1000);
  const remaining = verified.exp - now;
  // 已过期（verifyTokenDetailed 允许 60s 漂移）不再续期
  if (remaining <= 0) return null;

  return {
    accessToken: generateAccessToken(verified.username),
    refreshToken: signToken(
      verified.username,
      "refresh",
      REFRESH_TOKEN_TTL,
      verified.exp,
    ),
    expiresIn: ACCESS_TOKEN_TTL,
    refreshExpiresIn: remaining,
  };
};

export const getTokenFromEvent = (event: any): string | null => {
  const authHeader = getHeader(event, "authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
};
