import { createHmac, randomBytes } from "crypto";

const getSecret = (): string => {
  const SECRET = process.env.ADMIN_SECRET;
  if (!SECRET) {
    throw new Error(
      "[auth] ADMIN_SECRET 环境变量未设置，请在 .env 或部署环境中配置",
    );
  }
  return SECRET;
};

// JWT base64url 编码（不含 padding）
const base64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString("base64url");

const base64urlDecode = (str: string): string =>
  Buffer.from(str, "base64url").toString();

// 使用 timingSafeEqual 防止时序攻击
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return bufA.equals(bufB);
};

const JWT_HEADER = base64url(
  JSON.stringify({ alg: "HS256", typ: "JWT" }),
);

export const generateToken = (username: string): string => {
  const SECRET = getSecret();
  const now = Date.now();
  const payload = base64url(
    JSON.stringify({
      sub: username,
      iat: now,
      exp: now + 1000 * 60 * 60 * 24 * 7,
      jti: randomBytes(16).toString("hex"),
    }),
  );
  const signingInput = `${JWT_HEADER}.${payload}`;
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

  // 校验 header
  if (!safeEqual(header, JWT_HEADER)) return null;

  const SECRET = getSecret();
  const signingInput = `${header}.${payload}`;
  const expectedSignature = createHmac("sha256", SECRET)
    .update(signingInput)
    .digest("base64url");

  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const decoded = JSON.parse(base64urlDecode(payload));
    if (decoded.exp < Date.now()) return null;
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
