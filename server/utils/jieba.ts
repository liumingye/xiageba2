import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict.js";

const jieba = Jieba.withDict(dict);

// 辅助函数：清洗和安全化 token，去除干扰符号
const sanitizeToken = (token: string): string => {
  // 移除所有可能破坏 tsquery 语法的特殊控制字符：&, |, !, :, *, ( )
  // 同时把单引号替换为双单引号（PostgreSQL 的标准字符串转义）
  return token
    .trim()
    .replace(/[&|!:*()]/g, "")
    .replace(/'/g, "''");
};

export const cutForSearch = (input: string): string[] => {
  if (!input) return [];
  const text = String(input).trim();
  if (!text) return [];

  const jiebaTokens = jieba.cutForSearch(text, true);
  const groups: string[] = [];

  for (const token of jiebaTokens) {
    const t = sanitizeToken(token);
    // 过滤掉空字符串和无意义的单字符（如纯空格、或被洗掉的特殊符号）
    if (!t) continue;
    groups.push(t);
  }
  return groups;
};

/**
 * [模糊搜索]
 */
export const buildSearchTsQuery = (groups: string[]): string => {
  return groups.join(" | ");
};

/**
 * [精准搜索]
 */
export const buildSearchTsQueryExact = (groups: string[]): string => {
  return groups.join(" & ");
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
  buildSearchTsQuery,
  buildSearchTsQueryExact,
  tokenizeIndex,
  buildTokens,
};
