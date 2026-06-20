import nodejieba from "nodejieba";

/**
 * 使用 nodejieba 进行中文分词
 * - 会做基本的清洗（保留字母/数字/CJK 汉字）
 * - 输出用空格分隔的 tokens，便于后续 plainto_tsquery 使用
 *
 * 示例：
 *   tokenize("周杰伦") -> "周杰伦 周 杰 伦"
 *   tokenize("I love you") -> "I love you"
 */
export const tokenize = (input: string): string => {
  if (!input) return "";

  const text = String(input).trim();
  if (!text) return "";

  // 用 jieba 做词级别的精确分词
  const wordTokens = nodejieba.cut(text, true);

  // 为每个 token 再做单字补充，确保单字匹配也能命中（可选增强）
  const singleTokens: string[] = [];
  for (const token of wordTokens) {
    singleTokens.push(token);
    if (token.length > 1) {
      for (const ch of token) {
        singleTokens.push(ch);
      }
    }
  }

  // 去空白、去纯符号 token，避免污染 tsvector
  const filtered = singleTokens
    .map((t) => t.trim())
    .filter((t) => {
      if (!t) return false;
      // 排除纯标点符号 token（非字母/数字/汉字）
      const hasWordChar = /[A-Za-z0-9\u4e00-\u9fff]/.test(t);
      return hasWordChar;
    });

  return filtered.join(" ");
};

/**
 * 拼接 title / artist / album 为一组用于 searchVector 的 tokens 字符串
 * searchVector = to_tsvector('simple', <tokens>)
 */
export const buildTokens = (
  title: string,
  artist: string,
  album: string,
): string => {
  const parts = [title, artist, album]
    .map((s) => tokenize(s || ""))
    .filter(Boolean);
  return parts.join(" ");
};

export default { tokenize, buildTokens };
