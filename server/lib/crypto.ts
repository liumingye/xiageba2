import { getConfigValues } from "#server/lib/configCache";

const AES_KEYS = ["aes_key", "aes_iv"];

interface AesMaterial {
  cryptoKey: CryptoKey;
  iv: BufferSource;
}

const getAesMaterial = async (): Promise<AesMaterial | null> => {
  const cfg = await getConfigValues(AES_KEYS);
  if (!cfg.aes_key || !cfg.aes_iv) return null;

  try {
    const keyBuf = Buffer.from(cfg.aes_key, "base64");
    const ivBuf = Buffer.from(cfg.aes_iv, "base64");

    if (![16, 24, 32].includes(keyBuf.length)) return null;
    if (ivBuf.length !== 16) return null;

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuf,
      { name: "AES-CBC" },
      false,
      ["encrypt", "decrypt"],
    );

    return { cryptoKey, iv: new Uint8Array(ivBuf) };
  } catch {
    return null;
  }
};

/**
 * 使用 AES-CBC 加密 URL，未配置密钥时原样返回
 */
export const encryptUrl = async (url: string): Promise<string> => {
  const mat = await getAesMaterial();
  if (!mat) return url;

  const encoded = new TextEncoder().encode(url);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: mat.iv },
    mat.cryptoKey,
    encoded,
  );

  return Buffer.from(encrypted).toString("base64");
};

/**
 * 使用 AES-CBC 解密 URL，未配置密钥时原样返回
 * 配置存在但解密失败则返回 null
 */
export const decryptUrl = async (cipher: string): Promise<string | null> => {
  const mat = await getAesMaterial();
  if (!mat) return cipher;

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: mat.iv },
      mat.cryptoKey,
      Buffer.from(cipher, "base64"),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
};
