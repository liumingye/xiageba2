import { marked } from "marked";
import type { Renderer, RendererObject, Tokens } from "marked";

/**
 * 统一 marked 全局配置：GFM、换行转 <br>、同步返回。
 * 多个文件会重复 import 本模块，marked.setOptions 幂等，安全。
 */
marked.setOptions({ gfm: true, breaks: true, async: false });

/** HTML 实体转义，用于消毒不可信内容 */
const escapeHtml = (text: string, withQuote = false): string => {
  let out = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  if (withQuote) {
    out = out.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  return out;
};

/** 仅允许安全协议，过滤 javascript:/data:/vbscript: 等危险链接 */
const sanitizeHref = (href: string): string => {
  const trimmed = (href || "").trim();
  const proto = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (proto && !["http", "https", "mailto", "tel"].includes(proto)) {
    return "#";
  }
  return trimmed;
};

/**
 * 安全 Renderer：
 * - 原始 HTML（<img onerror> 等）一律转义为文本，防止 XSS
 * - 链接 href 转义属性值并过滤危险协议
 */
const safeRenderer: RendererObject = {
  html(this: Renderer, token: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(token.text);
  },
  link(this: Renderer, token: Tokens.Link): string {
    const href = sanitizeHref(token.href);
    const titleAttr = token.title
      ? ` title="${escapeHtml(token.title, true)}"`
      : "";
    const text =
      this.parser?.parseInline(token.tokens ?? []) ??
      escapeHtml(token.text ?? "");
    return `<a href="${escapeHtml(href, true)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
  },
};

marked.use({ renderer: safeRenderer });

/**
 * 渲染 Markdown 为安全 HTML（已转义原始 HTML、过滤危险链接协议）。
 * 用于 AI 对话、外部数据来源的富文本展示。
 */
export const renderSafeMarkdown = (text: string): string => {
  if (!text) return "";
  return marked.parse(text) as string;
};
