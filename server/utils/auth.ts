import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
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
  /** 签发令牌的管理员 ID；旧版令牌没有，为空串 */
  uid: string;
  /** 签发时的密码指纹；旧版令牌没有，为空串 */
  pv: string;
}

/** 写进令牌的凭据标识：校验时据此到库里核对管理员是否仍然有效 */
export interface TokenCredential {
  uid: string;
  pv: string;
}

/**
 * 密码指纹：密码哈希的 SHA-256 前 16 位十六进制。
 *
 * 令牌带着签发时的指纹，校验时与库里的当前指纹比对，改密码后旧令牌全部失效。
 * 输入是加盐的 scrypt 哈希，取摘要前缀不会泄露密码；密码每改一次指纹必然变化。
 */
export const credentialStamp = (passwordHash: string): string =>
  createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);

/** 由管理员记录构造令牌凭据标识 */
export const credentialOf = (admin: {
  id: string;
  password: string;
}): TokenCredential => ({
  uid: admin.id,
  pv: credentialStamp(admin.password),
});

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
export const safeEqual = (a: string, b: string): boolean => {
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
 * @param cred 凭据标识（管理员 ID + 密码指纹）。不传时签出的令牌无法通过吊销校验
 */
const signToken = (
  username: string,
  type: TokenType,
  ttlSeconds: number,
  expOverride?: number,
  cred?: TokenCredential,
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
      ...(cred ? { uid: cred.uid, pv: cred.pv } : {}),
    }),
  );

  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secretFor(type))
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
};

/** 签发 access token（1 小时） */
export const generateAccessToken = (
  username: string,
  cred?: TokenCredential,
): string => signToken(username, "access", ACCESS_TOKEN_TTL, undefined, cred);

/** 签发 refresh token（7 天） */
export const generateRefreshToken = (
  username: string,
  cred?: TokenCredential,
): string => signToken(username, "refresh", REFRESH_TOKEN_TTL, undefined, cred);

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
      uid: typeof decoded.uid === "string" ? decoded.uid : "",
      pv: typeof decoded.pv === "string" ? decoded.pv : "",
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

/**
 * 登录成功后签发的令牌组
 *
 * 需要完整的管理员记录：令牌里写入 ID 与密码指纹，供后续吊销校验。
 */
export const issueTokens = (admin: {
  id: string;
  username: string;
  password: string;
}): TokenPair => {
  const cred = credentialOf(admin);
  return {
    accessToken: generateAccessToken(admin.username, cred),
    refreshToken: generateRefreshToken(admin.username, cred),
    expiresIn: ACCESS_TOKEN_TTL,
    refreshExpiresIn: REFRESH_TOKEN_TTL,
  };
};

/**
 * 用已通过校验的 refresh token 载荷换一组新令牌（轮转）
 *
 * 新 refresh token 继承原会话的绝对过期点：7 天内持续活跃可以一直续，
 * 超过 7 天必须重新登录。这样既不会每小时踢人，也不会让会话无限延长。
 * 管理员 ID 与密码指纹原样带过去，新令牌继续受吊销校验约束。
 */
export const rotateVerifiedTokens = (
  verified: VerifiedToken,
): TokenPair | null => {
  const now = Math.floor(Date.now() / 1000);
  const remaining = verified.exp - now;
  // 已过期（verifyTokenDetailed 允许 60s 漂移）不再续期
  if (remaining <= 0) return null;

  const cred = { uid: verified.uid, pv: verified.pv };
  return {
    accessToken: generateAccessToken(verified.username, cred),
    refreshToken: signToken(
      verified.username,
      "refresh",
      REFRESH_TOKEN_TTL,
      verified.exp,
      cred,
    ),
    expiresIn: ACCESS_TOKEN_TTL,
    refreshExpiresIn: remaining,
  };
};

/**
 * 用 refresh token 换一组新令牌（轮转）
 *
 * 只做签名与有效期校验。调用方必须先确认该管理员仍然有效
 * （见 server/lib/adminToken.ts 的 resolveTokenAdmin），否则被删除或改过密码的
 * 管理员可以一直续期到 7 天到期。
 */
export const rotateTokens = (refreshToken: string): TokenPair | null => {
  const verified = verifyTokenDetailed(refreshToken, "refresh");
  if (!verified) return null;
  return rotateVerifiedTokens(verified);
};

export const getTokenFromEvent = (event: any): string | null => {
  const authHeader = getHeader(event, "authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
};
