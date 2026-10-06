import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ cfg: {} as Record<string, string> }));

vi.mock("#server/lib/configCache", () => ({
  getConfigValues: async (keys: string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = h.cfg[k] ?? "";
    return out;
  },
}));

const { encryptUrl, decryptUrl, decryptUrls } = await import("./crypto");

// AES-256 需要 32 字节 key；CBC 模式需要 16 字节 iv
const AES_KEY = Buffer.alloc(32, 7).toString("base64");
const AES_IV = Buffer.alloc(16, 3).toString("base64");

beforeEach(() => {
  h.cfg = { aes_key: AES_KEY, aes_iv: AES_IV };
});

describe("加解密往返", () => {
  it("加密后能解密回原文", async () => {
    const url = "https://pan.quark.cn/s/abc123";
    const cipher = await encryptUrl(url);

    expect(await decryptUrl(cipher)).toBe(url);
    expect((await decryptUrls([cipher]))[0]).toBe(url);
  });

  it("支持中文与长链接", async () => {
    const url = "https://pan.baidu.com/s/1中文测试" + "x".repeat(200);
    const cipher = await encryptUrl(url);

    expect((await decryptUrls([cipher]))[0]).toBe(url);
  });
});

describe("批量解密", () => {
  it("结果与逐个 decryptUrl 完全一致", async () => {
    const urls = ["url-a", "url-b", "url-c"];
    const ciphers = await Promise.all(urls.map((u) => encryptUrl(u)));

    const oneByOne = await Promise.all(ciphers.map((c) => decryptUrl(c)));
    const batch = await decryptUrls(ciphers);

    expect(batch).toEqual(oneByOne);
    expect(batch).toEqual(urls);
  });

  it("保持入参顺序", async () => {
    const urls = ["first", "second", "third"];
    const ciphers = await Promise.all(urls.map((u) => encryptUrl(u)));

    // 打乱后再批量解密，结果仍应按传入顺序排列
    const shuffled = [ciphers[2]!, ciphers[0]!, ciphers[1]!];
    expect(await decryptUrls(shuffled)).toEqual([
      "third",
      "first",
      "second",
    ]);
  });

  it("空数组返回空数组，不读配置", async () => {
    expect(await decryptUrls([])).toEqual([]);
  });
});

describe("边界与降级", () => {
  it("未配置密钥时原样返回（与 decryptUrl 一致）", async () => {
    h.cfg = { aes_key: "", aes_iv: "" };

    expect(await decryptUrl("plain-text")).toBe("plain-text");
    expect(await decryptUrls(["a", "b"])).toEqual(["a", "b"]);
  });

  it("密文非法时返回 null，不抛错", async () => {
    // "AAAA" 解码后只有 3 字节，不是 AES 块大小的整数倍，解密必然失败
    expect(await decryptUrl("AAAA")).toBeNull();
    expect((await decryptUrls(["AAAA"]))[0]).toBeNull();
  });

  it("批量中单个失败只影响自己", async () => {
    const good = await encryptUrl("ok");

    expect(await decryptUrls(["AAAA", good])).toEqual([null, "ok"]);
  });
});
