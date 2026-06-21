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

  for (const token of jiebaTokens) {
    if (!token.trim()) continue;
    groups.push(token);
  }

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
export const buildTokens = (
  title: string,
  artist: string,
  album: string,
): string => {
  const parts = [title, artist, album]
    .map((s) => tokenizeIndex(s || ""))
    .filter(Boolean);
  if (parts.length === 0) {
    let arr = [title, artist, album];
    return arr.join(" ");
  }
  return parts.join(" ");
};

export default { buildSearchTsQuery, tokenizeIndex, buildTokens };
