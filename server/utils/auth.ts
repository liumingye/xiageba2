import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const getSecret = (): string => {
  const SECRET = process.env.ADMIN_SECRET;
  if (!SECRET) {
    throw new Error(
      "[auth] ADMIN_SECRET 环境变量未设置，请在 .env 或部署环境中配置",
    );
  }
  return SECRET;
};

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

export const generateToken = (username: string): string => {
  const SECRET = getSecret();
  const now = Date.now();

  // 动态生成 Header 确保标准的结构
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const payload = base64url(
    JSON.stringify({
      sub: username,
      iat: Math.floor(now / 1000), // JWT 规范推荐使用秒级时间戳
      exp: Math.floor((now + 1000 * 60 * 60 * 24 * 7) / 1000), // 7 天过期
      jti: randomBytes(16).toString("hex"),
    }),
  );

  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", SECRET)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
};

export const verifyToken = (token: string): { username: string } | null => {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;

  try {
    // 1. 校验 Header 的算法（防御 "alg": "none" 攻击或算法欺骗）
    const headerObj = JSON.parse(base64urlDecode(header));
    if (headerObj.alg !== "HS256") return null;

    // 2. 验证签名（使用修正后的 safeEqual）
    const SECRET = getSecret();
    const signingInput = `${header}.${payload}`;
    const expectedSignature = createHmac("sha256", SECRET)
      .update(signingInput)
      .digest("base64url");

    if (!safeEqual(signature, expectedSignature)) return null;

    // 3. 校验 Payload 内容与过期时间
    const decoded = JSON.parse(base64urlDecode(payload));
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // 允许 60 秒的时钟漂移误差
    const CLOCK_SKEW = 60;
    if (decoded.exp && decoded.exp < currentTimestamp - CLOCK_SKEW) {
      return null;
    }

    return { username: decoded.sub };
  } catch {
    return null;
  }
};

export const getTokenFromEvent = (event: any): string | null => {
  const authHeader = getHeader(event, "authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
};
