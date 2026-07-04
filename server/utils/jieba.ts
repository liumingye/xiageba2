import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict.js";

// load jieba with the default dict
const jieba = Jieba.withDict(dict);

const cut = (input: string): string[] => {
  if (!input) return [];
  const text = String(input).trim();
  if (!text) return [];

  const jiebaTokens = jieba.cutForSearch(text, true);
  const groups: string[] = [];

  console.log(jiebaTokens);

  for (const token of jiebaTokens) {
    let t = token.trim();
    // // 过滤不可见特殊字符
    // .replace(/[\x00-\x1F\x7F]/g, "")
    // .replace("\\", "");

    if (t.trim() === "") continue;
    groups.push(`"${t}"`);
  }
  console.log(groups);

  return groups;
};

export const buildSearchTsQuery = (input: string): string => {
  return cut(input).join(" | ");
};

export const tokenizeIndex = (input: string): string => {
  return cut(input).join(" ");
};

/**
 * [写入/索引端用] 合并 title/artist/album 的 tokens
 */
export const buildTokens = (...terms: string[]): string => {
  const parts = terms.map((s) => tokenizeIndex(s || "")).filter(Boolean);
  if (parts.length === 0) {
    let arr = terms;
    return arr.join(" ");
  }
  return parts.join(" ");
};

export default { buildSearchTsQuery, tokenizeIndex, buildTokens };
