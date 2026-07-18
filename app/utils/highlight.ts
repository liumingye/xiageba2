const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] || char;
  });

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const highlightTokens = (text: string, tokens: string[]): string => {
  const source = String(text ?? "");
  const uniqueTokens = [
    ...new Map(
      tokens
        .map((token) => String(token).trim())
        .filter(Boolean)
        .map((token) => [token.toLocaleLowerCase(), token]),
    ).values(),
  ].sort((a, b) => b.length - a.length);

  if (!source || uniqueTokens.length === 0) return escapeHtml(source);

  const pattern = new RegExp(uniqueTokens.map(escapeRegExp).join("|"), "giu");
  let result = "";
  let lastIndex = 0;

  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    result += escapeHtml(source.slice(lastIndex, index));
    result += `<mark class="bg-transparent text-primary-400">${escapeHtml(match[0])}</mark>`;
    lastIndex = index + match[0].length;
  }

  return result + escapeHtml(source.slice(lastIndex));
};
