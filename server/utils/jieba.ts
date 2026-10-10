import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict.js";
import * as OpenCC from "opencc-js/core";
import * as Locale from "opencc-js/preset";
import { expandAliases } from "./search-alias";

if (!Locale.from.tw || !Locale.to.cn) {
  throw new Error("OpenCC locale files failed to load.");
}

const converter = OpenCC.ConverterFactory(Locale.from.tw, Locale.to.cn);
const jieba = Jieba.withDict(dict);

/**
 * 辅助函数：严格清洗和安全化 token，彻底根除 tsquery 语法破坏者
 */
const sanitizeToken = (token: string): string => {
  return (
    token
      .trim()
      // 🛑 彻底把单引号、反斜杠以及所有可能破坏 tsquery 语法的特殊控制字符全部蒸发掉
      //    \s 一并剔除：一个 token 内部不能带空白，否则 to_tsquery 会把它拆成两个词
      .replace(/[&|!:*()'"`\\,.<>/?;:[\]{}~\-_=+^$%#@\s]/g, "")
      .trim()
  );
};

/* ------------------------------------------------------------------ *
 * 冗余词（口语化 / 无区分度词）表
 *
 * 这些词**不会**被丢弃，只是从"必须命中"降级为"命中了加分"。
 * 因此把它们写进来不会导致误伤：真包含这些词的结果依然排在最前面
 * （由 tier 阶梯保证），只是在核心词无法全部命中时给一次兜底召回。
 * ------------------------------------------------------------------ */
const FILLER_WORDS = new Set<string>([
  // 人称代词
  "我", "你", "他", "她", "它", "咱", "您", "我们", "你们", "他们", "她们",
  "咱们", "自己", "人家", "大家",
  // 助词 / 语气词
  "的", "地", "得", "了", "着", "过", "吗", "呢", "吧", "啊", "呀", "哦", "嗯",
  "嘛", "啦", "咯", "呗", "咧", "噢", "哎", "哦", "喔", "嘞", "哈",
  // 高频虚词 / 系动词 / 连词
  "是", "在", "有", "和", "与", "或", "就", "都", "也", "还", "很", "太", "再",
  "又", "而", "及", "把", "被", "让", "使", "对", "给",
  // 口语动词（"我想听 / 帮我找" 里的动作词）
  "要", "会", "能", "可", "请", "帮", "找", "想", "听", "看", "说", "来", "去",
  "做", "用", "放", "开", "出", "进", "拿", "问", "叫", "搞",
  // 口语短语 / 量词
  "一下", "一个", "一首", "一点", "一些", "一遍", "这", "那", "哪", "什么",
  "怎么", "为什么", "有没有", "可不可以", "我想", "我要", "帮我", "给我",
  "请你", "麻烦", "一下儿", "来一首", "放一首", "我想听", "我要听", "帮我找",
  "一首歌", "有没有人",
  // 泛化业务词（只在与核心词共现时才被降级）
  "歌", "歌曲", "音乐", "播放", "收听", "下载", "资源", "搜索", "推荐", "歌词",
  "无损", "高清", "免费", "在线",
]);

export const isFillerToken = (token: string): boolean =>
  FILLER_WORDS.has(String(token ?? "").trim().toLocaleLowerCase());

/* ------------------------------------------------------------------ *
 * tsquery 构造
 *
 * ⚠️ 关键：必须用 to_tsquery，不能用 websearch_to_tsquery。
 * websearch_to_tsquery 会**静默丢弃括号**：
 *   websearch_to_tsquery('simple', 'A (B OR C)')  =>  'A' & 'B' | 'C'
 * 由于 | 的优先级低于 &，实际语义变成 (A & B) | C —— 只要命中 C 就返回，
 * 模糊搜索因此彻底退化。to_tsquery 会完整保留括号。
 * ------------------------------------------------------------------ */

/** 安全词元正则：只允许字母和数字（含 CJK 汉字） */
const SAFE_LEXEME = /^[\p{L}\p{N}]+$/u;

/** 把 token 包成 to_tsquery 的引号词元，杜绝语法注入 */
const lex = (token: string): string =>
  `"${String(token).replace(/["\\]/g, "")}"`;

/** token 是否可安全进入 tsquery */
const isUsableToken = (token: string): boolean => {
  const t = sanitizeToken(token);
  return Boolean(t) && SAFE_LEXEME.test(t);
};

/** 统计词元在文本中出现的次数（非重叠），用于识别"重复词" */
const countOccurrences = (haystack: string, needle: string): number => {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
};

/* ------------------------------------------------------------------ *
 * 查询分析
 * ------------------------------------------------------------------ */

export interface QueryTermGroup {
  /** 用户实际输入的词（用于前端高亮） */
  token: string;
  /** 词族：原词 + 别名规范词，组内 OR，组间 AND */
  members: string[];
  /** 在查询串中出现的次数（"山风山风" → 2） */
  count: number;
  /** 权重 = 字符数 × 出现次数，重复词权重翻倍 */
  weight: number;
  /** 是否为冗余词 */
  filler: boolean;
}

export interface SearchTier {
  /** exact | core | relaxed | loose —— 越靠前越严格 */
  name: string;
  /** to_tsquery 兼容的查询串 */
  query: string;
}

export interface SearchQueryPlan {
  /** 去重后的全部词（供前端高亮，行为与旧版一致） */
  tokens: string[];
  groups: QueryTermGroup[];
  /** 核心词（已剔除冗余词、按权重降序） */
  core: string[];
  /** 冗余词 */
  filler: string[];
  /** 归一化后的整串，用于完全匹配比较 */
  normalized: string;
  /** 召回阶梯，严格 → 宽松；调用方按顺序取，前面的 tier 一定排在结果最前 */
  tiers: SearchTier[];
  /** 用于 ts_rank 打分（取最宽的精确层，保证同一次查询打分口径一致） */
  rankQuery: string;
  /** 兜底层：全 OR，仅当上面所有 tier 都召不到时才用 */
  looseQuery: string;
}

/** 组内 OR、组间 AND */
const groupExpr = (group: QueryTermGroup): string => {
  const [first, ...restMembers] = group.members;
  // members 恒以原词开头，理论上不为空；这里兜底返回空串，交给调用方过滤
  if (!first) return "";
  if (restMembers.length === 0) return lex(first);
  return `(${group.members.map(lex).join(" | ")})`;
};

/** 按权重降序排：核心词优先，长词优先，重复词优先 */
const byWeight = (a: QueryTermGroup, b: QueryTermGroup): number => {
  if (a.filler !== b.filler) return a.filler ? 1 : -1;
  if (b.weight !== a.weight) return b.weight - a.weight;
  return Array.from(b.token).length - Array.from(a.token).length;
};

/**
 * 把 token 数组构造成词族（原词 + 别名）。
 * @param source 原始查询串；传入时会统计重复次数，传 null 则全部按 1 次计
 */
const buildGroups = (
  tokens: string[],
  source: string | null,
): QueryTermGroup[] => {
  const groups: QueryTermGroup[] = [];
  const seen = new Set<string>();

  for (const raw of tokens) {
    const token = sanitizeToken(raw);
    if (!isUsableToken(token) || seen.has(token.toLocaleLowerCase())) continue;
    seen.add(token.toLocaleLowerCase());

    const members = [token];
    for (const alias of expandAliases(token)) {
      const canonical = sanitizeToken(alias);
      if (!isUsableToken(canonical)) continue;
      if (members.some((m) => m.toLocaleLowerCase() === canonical.toLocaleLowerCase()))
        continue;
      members.push(canonical);
    }

    const count = source
      ? Math.max(1, countOccurrences(source, token.toLocaleLowerCase()))
      : 1;

    groups.push({
      token,
      members,
      count,
      weight: Array.from(token).length * count,
      filler: isFillerToken(token),
    });
  }

  return groups.sort(byWeight);
};

/**
 * 构造召回阶梯。
 *
 * 严格度单调递减（exact ⊆ core ⊆ relaxed ⊆ loose），调用方按数组顺序取用，
 * 并把 tier 序号作为排序的第一优先级 —— 这样"完全匹配"必然稳居第一位，
 * 越宽松的召回越靠后，不会出现无关结果反超的情况。
 */
const buildTiers = (groups: QueryTermGroup[], exact: boolean): SearchTier[] => {
  const tiers: SearchTier[] = [];
  const push = (name: string, query: string) => {
    if (!query) return;
    if (tiers.some((tier) => tier.query === query)) return;
    tiers.push({ name, query });
  };

  // T1 完全匹配：所有词 AND（与旧版 exact 语义完全一致）
  push("exact", groups.map(groupExpr).join(" & "));
  if (exact) return tiers;

  const coreGroups = groups.filter((g) => !g.filler);
  // 全是冗余词（例如只搜"音乐 无损"）时，把它们整体提升为核心词。
  // ⚠️ 提升后必须清空 filler：否则宽松层会变成 "音乐 & (无损 | 音乐)" ≡ "音乐"，
  //    冗余词反过来把约束彻底放空了。
  const promoted = coreGroups.length === 0;
  const effectiveCore = promoted ? groups : coreGroups;
  const fillerGroups = promoted ? [] : groups.filter((g) => g.filler);

  // T2 核心层：剔除口语/冗余词后 AND —— 解决"我想听周杰伦的晴天"这类查询
  push("core", effectiveCore.map(groupExpr).join(" & "));

  // T3 宽松层：主词 AND (其余核心词 | 冗余词)
  //    这里就是旧版写坏的地方：必须用括号，且必须用 to_tsquery 才能保留括号
  const [anchor, ...rest] = effectiveCore;
  const others = [...rest, ...fillerGroups];
  if (anchor && others.length > 0) {
    push(
      "relaxed",
      `${groupExpr(anchor)} & (${others.map(groupExpr).join(" | ")})`,
    );
  }

  return tiers;
};

/**
 * [查询端用] 完整分析一条搜索词，产出分词、词族、权重与召回阶梯。
 */
export const analyzeQuery = (
  input: string,
  exact = false,
): SearchQueryPlan => {
  const text = String(input ?? "").trim();
  const normalized = text.toLocaleLowerCase();
  const tokens = cutForSearch(text);
  const simplified = converter(text).toLocaleLowerCase();
  const groups = buildGroups(tokens, simplified || null);
  const tiers = buildTiers(groups, exact);

  return {
    tokens,
    groups,
    core: groups.filter((g) => !g.filler).map((g) => g.token),
    filler: groups.filter((g) => g.filler).map((g) => g.token),
    normalized,
    tiers,
    // 打分口径统一用最宽的精确层，保证结果之间可比
    rankQuery: tiers[tiers.length - 1]?.query ?? "",
    looseQuery: groups.map(groupExpr).join(" | "),
  };
};

/* ------------------------------------------------------------------ *
 * 旧接口（保持导出，语义已修正为 to_tsquery 语法）
 * ------------------------------------------------------------------ */

/**
 * 构造单条 tsquery 串。
 * - exact=true  → 全部词 AND（行为与旧版一致）
 * - exact=false → 主词 AND (其余词 OR …)，且**括号真实生效**
 *
 * ⚠️ 返回值必须交给 to_tsquery 而不是 websearch_to_tsquery。
 */
export const buildTsQuery = (tokens: string[], exact: boolean): string => {
  const groups = buildGroups(tokens ?? [], null);
  if (groups.length === 0) return "";
  const tiers = buildTiers(groups, exact);
  if (exact) return tiers[0]?.query ?? "";
  return tiers[tiers.length - 1]?.query ?? tiers[0]?.query ?? "";
};

/** @deprecated 保留旧名字，等价于 buildTsQuery */
export const buildSearchWebQuery = buildTsQuery;

/* ------------------------------------------------------------------ *
 * 索引端（不要改动：改动会导致已建索引与新查询不匹配）
 * ------------------------------------------------------------------ */

export const cutForSearch = (input: string): string[] => {
  if (!input) return [];
  const text = String(input).trim();
  if (!text) return [];

  // 先使用 OpenCC 转换为简体
  const simplifiedText = converter(text);
  const jiebaTokens = jieba.cutForSearch(simplifiedText, true);
  const groups: string[] = [];
  const normalizedText = simplifiedText.toLocaleLowerCase();
  const seen = new Set<string>();

  for (const token of jiebaTokens) {
    const t = sanitizeToken(token);
    const normalizedToken = t.toLocaleLowerCase();

    // Jieba occasionally emits artifacts that do not occur in the source.
    if (
      !t ||
      !normalizedText.includes(normalizedToken) ||
      seen.has(normalizedToken)
    ) {
      continue;
    }

    seen.add(normalizedToken);
    groups.push(t);
  }
  return groups;
};

/**
 * [写入/索引端用] 将词语安全组装给 PostgreSQL 的 searchVector
 */
export const tokenizeIndex = (groups: string[]): string => {
  return groups.join(" ");
};

export const buildTokens = (...terms: string[]): string => {
  const parts = terms
    .map((s) => tokenizeIndex(cutForSearch(s)))
    .filter(Boolean);
  if (parts.length === 0) {
    return terms.join(" ");
  }
  return parts.join(" ");
};

export default {
  cutForSearch,
  analyzeQuery,
  buildTsQuery,
  buildSearchWebQuery,
  tokenizeIndex,
  buildTokens,
};
