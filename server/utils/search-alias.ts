/**
 * 搜索别名表（查询端扩展，无需重建索引）
 *
 * 作用：用户输入的别名/昵称/缩写，会被扩展成库里真实存在的规范词。
 * 扩展出来的词与原始词之间用 OR 连接（同一"词族"），而不是 AND —— 否则
 * 查「周董」会变成 `周董 & 周杰伦`，两个词都不可能同时出现在同一条索引里，
 * 反而一条都召回不到。
 *
 * ── 如何扩展 ────────────────────────────────────────────────
 * 1. 直接往 SEARCH_ALIASES 里加条目即可，key 是用户输入，value 是规范词数组。
 * 2. key 必须全小写；匹配时会自动忽略大小写与繁简差异。
 * 3. 只影响查询侧：索引（Music/Source.searchVector）完全不需要重建。
 * 4. 若别名量很大（上千条），建议改成读库或读 Redis，保持本文件的导出签名不变。
 */
export const SEARCH_ALIASES: Record<string, string[]> = {
  周董: ["周杰伦"],
  杰伦: ["周杰伦"],
  jay: ["周杰伦"],
  "jay chou": ["周杰伦"],
  jj: ["林俊杰"],
  eason: ["陈奕迅"],
  gem: ["邓紫棋"],
  阿菲: ["王菲"],
  哥哥: ["张国荣"],
  歌神: ["张学友"],
  学友: ["张学友"],
  校长: ["谭咏麟"],
  天后: ["王菲"],
  杰伦哥: ["周杰伦"],
};

/**
 * 把别名映射表规范化：去掉空值、统一小写，并排除「自己指向自己」的死循环。
 */
const normalizeAliases = (
  raw: Record<string, string[]>,
): Record<string, string[]> => {
  const table: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(raw)) {
    const alias = key.trim().toLocaleLowerCase();
    if (!alias) continue;
    const canonical = (values || [])
      .map((value) => String(value).trim().toLocaleLowerCase())
      .filter((value) => value && value !== alias);
    if (canonical.length === 0) continue;
    table[alias] = [...new Set(canonical)];
  }
  return table;
};

export const ALIAS_TABLE = normalizeAliases(SEARCH_ALIASES);

/**
 * 查询一组词的别名扩展结果（只返回规范词，不含原词）。
 */
export const expandAliases = (token: string): string[] =>
  ALIAS_TABLE[token.toLocaleLowerCase()] ?? [];
