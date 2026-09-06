import breaks from "@comark/nuxt/plugins/breaks";
import security from "@comark/nuxt/plugins/security";
import shiki from "@comark/nuxt/plugins/shiki";

/**
 * 站点自行维护的信任内容（公告、版权/协议等）：
 * - 单换行转 <br>（与之前 marked 的 breaks 一致）
 * - shiki 代码高亮
 */
export const markdownPlugins = [breaks(), shiki()];

/** 不可信内容中会被直接丢弃的高危标签 */
const unsafeBlockedTags = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "optgroup",
  "link",
  "meta",
  "base",
  "svg",
  "math",
  "noscript",
  "template",
  "portal",
];

/**
 * 不可信内容（AI 输出、外部抓取的资源描述）：
 * 在 markdownPlugins 基础上增加 security 插件，丢弃高危标签、
 * 剥离 on* 事件属性并校验 url 协议，防止 XSS。
 */
export const safeMarkdownPlugins = [
  breaks(),
  security({
    blockedTags: unsafeBlockedTags,
  }),
  shiki(),
];
