import { describe, expect, it } from "vitest";
import { purifyUrl } from "./purifyUrl";
import { parseC139ShareURL } from "@netdisk-sdk/c139-sdk/share_api";
import { parseGuangyaShareURL } from "@netdisk-sdk/guangya-sdk/share_api";

describe("purifyUrl - 中国移动云盘", () => {
  it("无 & 时不追加提取码", () => {
    expect(
      purifyUrl("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&t=test"),
    ).toBe("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&test");
  });

  it("& 后面直接跟提取码时，取末尾四位", () => {
    expect(
      purifyUrl("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa"),
    ).toBe("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa");
  });

  it("&pwd=xxxx 时直接取该值", () => {
    expect(
      purifyUrl("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&pwd=aaaa"),
    ).toBe("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa");
  });

  it("& 后带前缀字符时仍然取末尾四位", () => {
    expect(
      purifyUrl("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&123agyn"),
    ).toBe("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&agyn");
  });

  it("caiyun.139.com 域名同样支持", () => {
    expect(
      purifyUrl("https://caiyun.139.com/w/i/2w2KGS8UroDs4&1ben&test=aaaa"),
    ).toBe("https://caiyun.139.com/w/i/2w2KGS8UroDs4&1ben&aaaa");
  });

  it("http 链接统一为 https", () => {
    expect(
      purifyUrl("http://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa"),
    ).toBe("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa");
  });

  it("能从一段混杂文本中抠出链接与提取码", () => {
    expect(
      purifyUrl(
        "电影合集 链接：https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa 速存",
      ),
    ).toBe("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa");
  });
});

describe("purifyUrl - 光鸭云盘", () => {
  const shareId = "1954483955528601683_ahbuQx891sNe7a8s";

  it("无提取码时保持原链接", () => {
    expect(purifyUrl(`https://www.guangyapan.com/s/${shareId}`)).toBe(
      `https://www.guangyapan.com/s/${shareId}`,
    );
  });

  it("分享标识大小写必须保留，不能被转小写", () => {
    expect(purifyUrl("https://www.guangyapan.com/s/AbC123_XyZ?code=ldkk")).toBe(
      "https://www.guangyapan.com/s/AbC123_XyZ?code=ldkk",
    );
  });

  it("支持不带 www 的域名", () => {
    expect(purifyUrl(`https://guangyapan.com/s/${shareId}?code=ldkk`)).toBe(
      `https://guangyapan.com/s/${shareId}?code=ldkk`,
    );
  });

  it("能从一段混杂文本中抠出链接与提取码", () => {
    expect(
      purifyUrl(
        `【高清】合集 https://www.guangyapan.com/s/${shareId}?code=ldkk 提取码: ldkk`,
      ),
    ).toBe(`https://www.guangyapan.com/s/${shareId}?code=ldkk`);
  });
});

/**
 * 净化后的链接必须能被转存链路（parseC139ShareURL / parseGuangyaShareURL）正确解析，
 * 否则录入进去的链接在转存时会被当成"没有提取码"。
 */
describe("purifyUrl - 与网盘 SDK 解析结果对齐", () => {
  it("移动云盘：linkId 与提取码都能被 SDK 解析出来", () => {
    const parsed = parseC139ShareURL(
      purifyUrl("https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa"),
    );

    expect(parsed.linkId).toBe("2xop65sqZtC7x");
    expect(parsed.passcode).toBe("aaaa");
  });

  it("光鸭：shareId 与提取码都能被 SDK 解析出来", () => {
    const parsed = parseGuangyaShareURL(
      purifyUrl(
        "https://www.guangyapan.com/s/1954483955528601683_ahbuQx891sNe7a8s?code=ldkk",
      ),
    );

    expect(parsed.shareId).toBe("1954483955528601683_ahbuQx891sNe7a8s");
    expect(parsed.passcode).toBe("ldkk");
  });
});

describe("purifyUrl - 既有网盘行为保持不变", () => {
  it("百度 share/init 转换为 /s/1xxx", () => {
    expect(
      purifyUrl("https://pan.baidu.com/share/init?surl=abc123&pwd=xy12"),
    ).toBe("https://pan.baidu.com/s/1abc123?pwd=xy12");
  });

  it("夸克链接补上提取码", () => {
    expect(purifyUrl("https://pan.quark.cn/s/abc123 提取码: abcd")).toBe(
      "https://pan.quark.cn/s/abc123",
    );
    expect(
      purifyUrl("https://pan.quark.cn/s/abc123?pwd=abcd 一堆中文说明"),
    ).toBe("https://pan.quark.cn/s/abc123?pwd=abcd");
  });

  it("迅雷链接补上提取码", () => {
    expect(purifyUrl("https://pan.xunlei.com/s/abc123?pwd=abcd")).toBe(
      "https://pan.xunlei.com/s/abc123?pwd=abcd",
    );
  });

  it("未匹配到任何网盘链接时原样返回", () => {
    expect(purifyUrl("这是一段没有链接的文字")).toBe("这是一段没有链接的文字");
  });

  it("空输入返回空串", () => {
    expect(purifyUrl("   ")).toBe("");
  });
});
