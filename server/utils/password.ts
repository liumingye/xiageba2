// 密码哈希工具：使用 Node 内置 crypto.scrypt（基于内存的 KDF，对抗 GPU 暴力破解）
// 存储格式："<salt-hex>$<hash-hex>"
// - salt：4 字节随机 salt
// - hash：16 字节 scrypt 输出

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// scrypt 参数：推荐生产值（OWASP 建议 N >= 2^14）
// N 越大越慢越安全；需在性能与安全之间平衡
const SCRYPT_N = 2 ** 14; // 16384
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_LEN = 16;
const HASH_LEN = 16;

/**
 * 生成新版 scrypt 密码哈希
 */
export function hashPassword(plain: string): string {
  if (!plain) throw new Error("密码不能为空");
  const salt = randomBytes(SALT_LEN).toString("hex");
  const derived = scryptSync(plain, salt, HASH_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `${salt}$${derived}`;
}

/**
 * 验证密码
 */
export function verifyPassword(plain: string, hashed: string): { ok: boolean } {
  if (!plain || !hashed) return { ok: false };

  // 新版 scrypt 格式
  const parts = hashed.split("$");
  if (parts.length !== 2) return { ok: false };

  const [salt, expectedHex] = parts;

  if (!salt || !expectedHex) return { ok: false };

  try {
    const derived = scryptSync(plain, salt, HASH_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return { ok: false };
    const ok = timingSafeEqual(derived, expected);
    return { ok };
  } catch {
    return { ok: false };
  }
}
