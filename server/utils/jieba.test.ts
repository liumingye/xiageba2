import { describe, expect, it } from "vitest";
import {
  analyzeQuery,
  buildTsQuery,
  cutForSearch,
} from "./jieba";

describe("cutForSearch", () => {
  it("removes duplicate and synthetic tokens", () => {
    const input = "a林俊杰林俊杰林俊杰林俊杰";
    const tokens = cutForSearch(input);

    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens).toContain("a");
    expect(tokens).toContain("林俊杰");
    expect(tokens).not.toContain("1");
    expect(tokens.every((token) => input.includes(token))).toBe(true);
  });
});

describe("buildTsQuery", () => {
  it("用 to_tsquery 语法真实保留括号（回归：websearch_to_tsquery 会丢括号）", () => {
    // 旧实现产出 "第四季 (开始 OR 推理)"，经 websearch_to_tsquery 解析后变成
    // '第四季' & '开始' | '推理'  ≡  (第四季 & 开始) | 推理 —— 只要命中"推理"就返回。
    // 新实现必须显式带 & | 与括号。
    expect(buildTsQuery(["第四季", "开始", "推理"], false)).toBe(
      '"第四季" & ("开始" | "推理")',
    );
  });

  it("精准模式保持全部词 AND（不破坏现有能力）", () => {
    expect(buildTsQuery(["周杰伦", "晴天"], true)).toBe('"周杰伦" & "晴天"');
  });

  it("过滤会破坏 tsquery 语法的 token", () => {
    expect(buildTsQuery(["周杰伦", "!!", "", "晴天"], true)).toBe(
      '"周杰伦" & "晴天"',
    );
  });
});

describe("analyzeQuery", () => {
  it("识别重复词并让其权重翻倍", () => {
    const plan = analyzeQuery("山风山风等等我", false);
    const shanFeng = plan.groups.find((g) => g.token === "山风");

    expect(shanFeng?.count).toBe(2);
    // 权重 = 字符数 × 出现次数 = 2 × 2
    expect(shanFeng?.weight).toBe(4);
    // 重复词权重最高 → 被选为锚点词
    expect(plan.core[0]).toBe("山风");
  });

  it("把口语/冗余词降级为非必命中词", () => {
    const plan = analyzeQuery("我想听周杰伦的晴天", false);

    expect(plan.filler).toEqual(expect.arrayContaining(["我", "想", "听", "的"]));
    expect(plan.core).toEqual(expect.arrayContaining(["周杰伦", "晴天"]));
    // 核心层不含冗余词
    expect(plan.tiers.find((t) => t.name === "core")?.query).toBe(
      '"周杰伦" & "晴天"',
    );
  });

  it("产出严格度递减的召回阶梯，且模糊层括号完整", () => {
    const plan = analyzeQuery("山风山风等等我", false);

    expect(plan.tiers.map((t) => t.name)).toEqual(["exact", "core", "relaxed"]);
    // T1 完全匹配：与精准搜索语义一致
    expect(plan.tiers[0]?.query).toBe('"山风" & "等等" & "我"');
    // T3 宽松层：锚点词 AND (其余词 OR …)，括号必须存在
    expect(plan.tiers[2]?.query).toBe('"山风" & ("等等" | "我")');
  });

  it("精准模式只产出完全匹配层", () => {
    const plan = analyzeQuery("山风山风等等我", true);
    expect(plan.tiers).toHaveLength(1);
    expect(plan.tiers[0]?.query).toBe('"山风" & "等等" & "我"');
  });

  it("别名扩展为 OR 词族，而不是 AND", () => {
    const plan = analyzeQuery("周董", false);
    const group = plan.groups.find((g) => g.token === "周董");

    expect(group?.members).toEqual(["周董", "周杰伦"]);
    // 必须是 (周董 | 周杰伦)，不能是 周董 & 周杰伦（后者永远召回不到）
    expect(plan.tiers[0]?.query).toBe('("周董" | "周杰伦")');
  });

  it("全为冗余词时兜底提升为核心词，不会产出空查询", () => {
    const plan = analyzeQuery("音乐", false);
    expect(plan.tiers.length).toBeGreaterThan(0);
    expect(plan.tiers[0]?.query).toBe('"音乐"');
  });
});
