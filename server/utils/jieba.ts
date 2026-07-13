import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict.js";

const jieba = Jieba.withDict(dict);

/**
 * 辅助函数：严格清洗和安全化 token，彻底根除 tsquery 语法破坏者
 */
const sanitizeToken = (token: string): string => {
  return (
    token
      .trim()
      // 🛑 彻底把单引号、反斜杠以及所有可能破坏 tsquery 语法的特殊控制字符全部蒸发掉
      .replace(/[&|!:*()'"`\\,.<>/?;:[\]{}~\-_=+^$%#@]/g, "")
      .trim()
  );
};

export const cutForSearch = (input: string): string[] => {
  if (!input) return [];
  const text = String(input).trim();
  if (!text) return [];

  const jiebaTokens = jieba.cutForSearch(text, true);
  const groups: string[] = [];

  for (const token of jiebaTokens) {
    const t = sanitizeToken(token);
    // 2. 过滤掉空字符串、纯空格和单独的数字/字符垃圾片段
    if (!t || t === "" || t === "''") continue;
    groups.push(t);
  }
  return groups.filter(Boolean);
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
  tokenizeIndex,
  buildTokens,
};
