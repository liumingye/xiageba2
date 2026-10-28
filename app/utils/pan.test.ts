// 网盘类型中文标签测试：覆盖 getPanTypeLabel 全量映射与未知类型回退
// 对应源码：app/utils/pan.ts

import { describe, expect, it } from "vitest";
import {
  getPanTypeLabel,
  normalizePanType,
  PAN_TYPE_LABELS,
  PAN_TYPE_OPTIONS,
  PAN_TYPE_ORDER,
} from "./pan";

describe("getPanTypeLabel", () => {
  it("夸克网盘", () => {
    expect(getPanTypeLabel("quark")).toBe("夸克网盘");
  });

  it("百度网盘", () => {
    expect(getPanTypeLabel("baidu")).toBe("百度网盘");
  });

  it("UC 网盘", () => {
    expect(getPanTypeLabel("uc")).toBe("UC 网盘");
  });

  it("迅雷云盘", () => {
    expect(getPanTypeLabel("xunlei")).toBe("迅雷云盘");
  });

  it("光鸭云盘", () => {
    expect(getPanTypeLabel("guangya")).toBe("光鸭云盘");
  });

  it("中国移动云盘", () => {
    expect(getPanTypeLabel("c139")).toBe("中国移动云盘");
  });

  it("未知类型回退为原始类型字符串", () => {
    expect(getPanTypeLabel("unknown")).toBe("unknown");
    expect(getPanTypeLabel("ali")).toBe("ali");
    expect(getPanTypeLabel("")).toBe("");
  });
});

describe("PAN_TYPE_LABELS 常量", () => {
  it("包含后台场景所需类型", () => {
    expect(PAN_TYPE_LABELS.quark).toBe("夸克网盘");
    expect(PAN_TYPE_LABELS.baidu).toBe("百度网盘");
    expect(PAN_TYPE_LABELS.uc).toBe("UC 网盘");
    expect(PAN_TYPE_LABELS.xunlei).toBe("迅雷云盘");
    expect(PAN_TYPE_LABELS.guangya).toBe("光鸭云盘");
    expect(PAN_TYPE_LABELS.c139).toBe("中国移动云盘");
  });

  it("映射条目数量固定为 6", () => {
    expect(Object.keys(PAN_TYPE_LABELS)).toHaveLength(6);
  });

  it("PAN_TYPE_ORDER 与 PAN_TYPE_LABELS 一一对应", () => {
    expect([...PAN_TYPE_ORDER].sort()).toEqual(
      Object.keys(PAN_TYPE_LABELS).sort(),
    );
  });

  it("PAN_TYPE_OPTIONS 保持 PAN_TYPE_ORDER 的顺序且标签取自映射表", () => {
    expect(PAN_TYPE_OPTIONS).toEqual([
      { label: "夸克网盘", value: "quark" },
      { label: "百度网盘", value: "baidu" },
      { label: "UC 网盘", value: "uc" },
      { label: "迅雷云盘", value: "xunlei" },
      { label: "光鸭云盘", value: "guangya" },
      { label: "中国移动云盘", value: "c139" },
    ]);
  });
});

describe("normalizePanType", () => {
  it("AI 工具返回的 139 归一化为库里的 c139", () => {
    expect(normalizePanType("139")).toBe("c139");
  });

  it("其余类型原样返回", () => {
    expect(normalizePanType("quark")).toBe("quark");
    expect(normalizePanType("c139")).toBe("c139");
    expect(normalizePanType("unknown")).toBe("unknown");
  });

  it("139 也能查到中文标签，不会露出原始标识", () => {
    expect(getPanTypeLabel("139")).toBe("中国移动云盘");
  });
});
