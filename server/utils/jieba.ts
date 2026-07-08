import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict.js";

// load jieba with the default dict
const jieba = Jieba.withDict(dict);

export const cutForSearch = (input: string): string[] => {
  if (!input) return [];
  const text = String(input).trim();
  if (!text) return [];

  const jiebaTokens = jieba.cutForSearch(text, true);
  const groups: string[] = [];

  for (const token of jiebaTokens) {
    let t = token.trim();
    if (t.trim() === "") continue;
    const escapeSet = new Set(["\\", "'"]);
    if (escapeSet.has(t)) {
      t = "\\" + t;
    }
    // groups.push(`'${t}'`);
    groups.push(t);
  }
  return groups;
};

const wrapQuotes = (t: string[]) => t.map((t) => `'${t}'`);

export const buildSearchTsQuery = (groups: string[]): string => {
  return wrapQuotes(groups).join(" | ");
};

export const buildSearchTsQueryExact = (groups: string[]): string => {
  return wrapQuotes(groups).join(" & ");
};

export const tokenizeIndex = (groups: string[]): string => {
  return wrapQuotes(groups).join(" ");
};

/**
 * [写入/索引端用] 合并 title/artist/album 的 tokens
 */
export const buildTokens = (...terms: string[]): string => {
  const parts = terms
    .map((s) => tokenizeIndex(cutForSearch(s)))
    .filter(Boolean);
  if (parts.length === 0) {
    let arr = terms;
    return arr.join(" ");
  }
  return parts.join(" ");
};

export default { cutForSearch, buildSearchTsQuery, tokenizeIndex, buildTokens };
