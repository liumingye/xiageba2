import shiki from "@comark/nuxt/plugins/shiki";

/**
 * 站点自行维护的信任内容（公告、版权/协议等）：
 * - shiki 代码高亮
 *
 * 依赖 shiki（约 543KB），仅供低频的公告 / 自定义页面使用。
 * 不可信内容请用 `~/utils/comark-safe` 的 safeMarkdownPlugins——
 * 两者必须分开成两个文件，shiki 是模块顶层 import，混在一个模块里
 * 即使只用 security 也会被整包拖进来。
 */
export const markdownPlugins = [shiki()];
