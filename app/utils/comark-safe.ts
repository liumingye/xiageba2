import security from "@comark/nuxt/plugins/security";

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
 * security 插件丢弃高危标签、剥离 on* 事件属性并校验 url 协议，防止 XSS。
 *
 * ⚠️ 刻意不引入 shiki。shiki 连同语法表约 543KB，代码高亮只对站点自有
 * 内容（公告、自定义页面）有意义；放在这里会把整套高亮引擎静态打进
 * 搜索页 / 资源详情页的首屏 chunk（实测 CVrrxn8b.js、DdwaADD3.js
 * 都被 D2US_5is.js 拖累）。需要代码高亮的信任内容请用 `~/utils/comark`。
 */
export const safeMarkdownPlugins = [
  security({
    blockedTags: unsafeBlockedTags,
  }),
];
