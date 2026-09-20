// 网盘 URL 类型识别测试：覆盖 getStorageType 及其衍生函数的全部主流网盘与边界场景
// 对应源码：shared/utils/index.ts

import { describe, expect, it } from "vitest";
import {
  getStorageType,
  getStorageTypeFriend,
  getStorageTypeFriendShort,
  getStorageTypeFriendFromFilter,
  getStorageTypeFriendShortFromFilter,
} from "./index";

describe("getStorageType", () => {
  it("识别夸克网盘", () => {
    expect(getStorageType("https://pan.quark.cn/s/abc123")).toBe("quark");
  });

  it("识别百度网盘", () => {
    expect(getStorageType("https://pan.baidu.com/share/xyz")).toBe("baidu");
  });

  it("识别迅雷云盘", () => {
    expect(getStorageType("https://pan.xunlei.com/share/yy")).toBe("xunlei");
  });

  it("识别 UC 网盘（fast.uc.cn）", () => {
    expect(getStorageType("https://fast.uc.cn/s/1234")).toBe("uc");
  });

  it("识别 UC 网盘（drive.uc.cn）", () => {
    expect(getStorageType("https://drive.uc.cn/s/abcd")).toBe("uc");
  });

  it("识别阿里云盘（alipan.com）", () => {
    expect(getStorageType("https://www.alipan.com/s/r/abc")).toBe("ali");
  });

  it("识别阿里云盘（aliyundrive.com 旧域名）", () => {
    expect(getStorageType("https://www.aliyundrive.com/s/abc")).toBe("ali");
  });

  it("识别天翼云盘（cloud.189.cn）", () => {
    expect(getStorageType("https://cloud.189.cn/t/abc")).toBe("189");
  });

  it("识别天翼云盘（ecloud.189.cn）", () => {
    expect(getStorageType("https://ecloud.189.cn/t/abc")).toBe("189");
  });

  it("识别移动云盘（yun.139.com）", () => {
    expect(getStorageType("https://yun.139.com/share/abc")).toBe("139");
  });

  it("识别 123 云盘（123pan.com）", () => {
    expect(getStorageType("https://www.123pan.com/s/abc")).toBe("123");
  });

  it("识别 123 云盘分享子域（share.123pan.cn）", () => {
    expect(getStorageType("https://share.123pan.cn/abc")).toBe("123");
  });

  it("识别 115 网盘（115.com）", () => {
    expect(getStorageType("https://115.com/s/abc")).toBe("115");
  });

  it("识别 115 网盘（115cdn.com）", () => {
    expect(getStorageType("https://115cdn.com/s/abc")).toBe("115");
  });

  it("识别 PikPak", () => {
    expect(getStorageType("https://toapp.mypikpak.com/share/abc")).toBe(
      "pikpak",
    );
  });

  it("识别磁力链接（magnet 协议）", () => {
    expect(
      getStorageType(
        "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
      ),
    ).toBe("magnet");
  });

  it("未匹配时返回 other", () => {
    expect(getStorageType("https://example.com/some/path")).toBe("other");
  });

  it("空字符串返回 other", () => {
    expect(getStorageType("")).toBe("other");
  });

  it("非 URL 字符串返回 other（new URL 抛错被兜底）", () => {
    expect(getStorageType("not-a-url")).toBe("other");
  });

  it("hostname 大小写不敏感", () => {
    expect(getStorageType("https://PAN.QUARK.CN/s/abc")).toBe("quark");
  });

  it("自动剥离 www. 前缀", () => {
    expect(getStorageType("https://www.pan.baidu.com/share/x")).toBe("baidu");
  });

  it("URL 前后带空格时仍能识别", () => {
    expect(getStorageType("  https://pan.quark.cn/s/abc  ")).toBe("quark");
  });
});

describe("getStorageTypeFriend", () => {
  it("返回中文长名", () => {
    expect(getStorageTypeFriend("https://pan.quark.cn/s/abc")).toBe("夸克网盘");
    expect(getStorageTypeFriend("https://pan.baidu.com/share/x")).toBe(
      "百度网盘",
    );
  });

  it("未匹配返回「其他链接」", () => {
    expect(getStorageTypeFriend("https://example.com/x")).toBe("其他链接");
  });

  it("磁力链接返回「磁力链接」", () => {
    expect(getStorageTypeFriend("magnet:?xt=urn:btih:abc")).toBe("磁力链接");
  });
});

describe("getStorageTypeFriendShort", () => {
  it("返回中文短名", () => {
    expect(getStorageTypeFriendShort("https://pan.quark.cn/s/abc")).toBe("夸克");
    expect(getStorageTypeFriendShort("https://pan.baidu.com/share/x")).toBe(
      "百度",
    );
  });

  it("未匹配返回「其他」", () => {
    expect(getStorageTypeFriendShort("https://example.com/x")).toBe("其他");
  });
});

describe("getStorageTypeFriendFromFilter", () => {
  it("根据 PanFilter 类型返回长名", () => {
    expect(getStorageTypeFriendFromFilter("quark")).toBe("夸克网盘");
    expect(getStorageTypeFriendFromFilter("baidu")).toBe("百度网盘");
    expect(getStorageTypeFriendFromFilter("magnet")).toBe("磁力链接");
  });

  it("未知类型回退为「其他链接」", () => {
    // @ts-expect-error 测试非法输入
    expect(getStorageTypeFriendFromFilter("unknown-type")).toBe("其他链接");
  });
});

describe("getStorageTypeFriendShortFromFilter", () => {
  it("根据 PanFilter 类型返回短名", () => {
    expect(getStorageTypeFriendShortFromFilter("quark")).toBe("夸克");
    expect(getStorageTypeFriendShortFromFilter("115")).toBe("115");
    expect(getStorageTypeFriendShortFromFilter("magnet")).toBe("磁力");
  });

  it("未知类型回退为「其他」", () => {
    // @ts-expect-error 测试非法输入
    expect(getStorageTypeFriendShortFromFilter("unknown-type")).toBe("其他");
  });
});
