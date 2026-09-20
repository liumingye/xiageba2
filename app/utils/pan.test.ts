// 网盘类型中文标签测试：覆盖 getPanTypeLabel 全量映射与未知类型回退
// 对应源码：app/utils/pan.ts

import { describe, expect, it } from "vitest";
import { getPanTypeLabel, PAN_TYPE_LABELS } from "./pan";

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

  it("未知类型回退为原始类型字符串", () => {
    expect(getPanTypeLabel("unknown")).toBe("unknown");
    expect(getPanTypeLabel("ali")).toBe("ali");
    expect(getPanTypeLabel("")).toBe("");
  });
});

describe("PAN_TYPE_LABELS 常量", () => {
  it("包含 4 个后台场景所需类型", () => {
    expect(PAN_TYPE_LABELS.quark).toBe("夸克网盘");
    expect(PAN_TYPE_LABELS.baidu).toBe("百度网盘");
    expect(PAN_TYPE_LABELS.uc).toBe("UC 网盘");
    expect(PAN_TYPE_LABELS.xunlei).toBe("迅雷云盘");
  });

  it("映射条目数量固定为 4", () => {
    expect(Object.keys(PAN_TYPE_LABELS)).toHaveLength(4);
  });
});
