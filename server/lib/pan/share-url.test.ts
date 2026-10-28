import { describe, expect, it } from "vitest";
import { ALLOWED_HOSTS, normalizeShareUrl, parseShareUrl } from "./share-url";

describe("parseShareUrl", () => {
  it("识别夸克并提取提取码", () => {
    expect(parseShareUrl("https://pan.quark.cn/s/abc123?pwd=x9k2")).toEqual({
      type: "quark",
      fid: "abc123",
      passcode: "x9k2",
      url: "https://pan.quark.cn/s/abc123?pwd=x9k2",
    });
  });

  it("识别 UC（drive 与 fast 两种子域）", () => {
    expect(parseShareUrl("https://drive.uc.cn/s/deadbeef").type).toBe("uc");
    expect(parseShareUrl("https://fast.uc.cn/s/deadbeef").type).toBe("uc");
  });

  it("识别百度标准分享", () => {
    const parsed = parseShareUrl("https://pan.baidu.com/s/1AbCdEf?pwd=6666");
    expect(parsed.type).toBe("baidu");
    expect(parsed.fid).toBe("1AbCdEf");
    expect(parsed.passcode).toBe("6666");
  });

  it("百度的 share/init 形式要为 surl 补前导 1", () => {
    const parsed = parseShareUrl(
      "https://pan.baidu.com/share/init?surl=XyZ789&pwd=abcd",
    );
    expect(parsed.type).toBe("baidu");
    expect(parsed.fid).toBe("1XyZ789");
    expect(parsed.passcode).toBe("abcd");
  });

  it("识别迅雷", () => {
    const parsed = parseShareUrl("https://pan.xunlei.com/s/VN_abc-123?pwd=1234");
    expect(parsed.type).toBe("xunlei");
    expect(parsed.fid).toBe("VN_abc-123");
    expect(parsed.passcode).toBe("1234");
  });

  it("提取码支持多种分隔写法", () => {
    expect(parseShareUrl("https://pan.quark.cn/s/a 提取码：ab12").passcode).toBe(
      "ab12",
    );
    expect(parseShareUrl("https://pan.quark.cn/s/a 密码 ab12").passcode).toBe(
      "ab12",
    );
    expect(parseShareUrl("https://pan.quark.cn/s/a code=ab12").passcode).toBe(
      "ab12",
    );
  });

  it("提取码只认 4 位，连续长串只取前 4 位", () => {
    // 与重构前一致：正则限定字符集与长度，但不锚定结尾
    expect(parseShareUrl("https://pan.quark.cn/s/a 提取码：abcdef").passcode).toBe(
      "abcd",
    );
  });

  it("提取码含非字母数字时不会被截取出来", () => {
    expect(parseShareUrl("https://pan.quark.cn/s/a 提取码：a-b-c").passcode).toBe(
      "",
    );
  });

  it("无法识别时返回 unknown 且 fid 为空", () => {
    const parsed = parseShareUrl("https://example.com/whatever");
    expect(parsed.type).toBe("unknown");
    expect(parsed.fid).toBe("");
    expect(parsed.passcode).toBe("");
  });
});

describe("normalizeShareUrl", () => {
  it("全角问号/与号转半角", () => {
    expect(normalizeShareUrl("https://pan.quark.cn/s/a？pwd=ab12")).toBe(
      "https://pan.quark.cn/s/a?pwd=ab12",
    );
    expect(normalizeShareUrl("https://pan.quark.cn/s/a？pwd=ab12＆x=1")).toBe(
      "https://pan.quark.cn/s/a?pwd=ab12&x=1",
    );
  });

  it("去掉首尾与中间所有空白", () => {
    expect(normalizeShareUrl("  https://pan.quark.cn/s/a ?pwd=ab12  ")).toBe(
      "https://pan.quark.cn/s/a?pwd=ab12",
    );
  });
});

describe("ALLOWED_HOSTS", () => {
  it("覆盖全部六类网盘域名", () => {
    for (const host of [
      "pan.quark.cn",
      "pan.baidu.com",
      "drive.uc.cn",
      "pan.xunlei.com",
      "www.guangyapan.com",
      "yun.139.com",
    ]) {
      expect(ALLOWED_HOSTS.has(host)).toBe(true);
    }
  });

  it("不包含任意第三方域名", () => {
    expect(ALLOWED_HOSTS.has("evil.example.com")).toBe(false);
  });
});
