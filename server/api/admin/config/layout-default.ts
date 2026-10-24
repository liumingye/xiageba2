import {
  getLayoutDefaultConfig,
  saveLayoutDefaultConfig,
  type LayoutDefaultConfig,
  type LayoutLinkSource,
} from "#server/lib/layoutConfig";
import {
  isLayoutPresetKey,
  LAYOUT_LINK_PRESETS,
} from "#server/lib/layoutPresets";

const sourceOf = (item: any): LayoutLinkSource =>
  item?.source === "preset" || item?.source === "page" ? item.source : "manual";

/**
 * 校验链接型配置
 *
 * - manual / preset：文案与链接必填，图标选填（留空则前台不展示图标）
 * - page：必须关联页面（pageId 或 slug），文案与图标可留空（运行时取页面标题）
 */
function assertLinksValid(list: unknown, name: string) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    throw createError({ statusCode: 400, message: `${name} 格式不正确` });
  }

  for (const item of list) {
    const source = sourceOf(item);

    // 预设来源：key 合法即可，文案/链接/图标由服务端按预设补全
    if (source === "preset") {
      if (!isLayoutPresetKey(item?.ref)) {
        throw createError({
          statusCode: 400,
          message: `${name} 中存在无效的预设入口（${
            String(item?.ref ?? "").trim() || "空"
          }）`,
        });
      }
      continue;
    }

    if (source === "page") {
      const pageId = String(item?.ref ?? "").trim();
      const slug = String(item?.slug ?? "").trim();
      if (!pageId && !slug) {
        throw createError({
          statusCode: 400,
          message: `${name} 中存在未关联页面的条目`,
        });
      }
      continue;
    }

    if (!String(item?.label ?? "").trim()) {
      throw createError({
        statusCode: 400,
        message: `${name} 中存在缺少文案的条目`,
      });
    }
    if (!String(item?.to ?? "").trim()) {
      throw createError({
        statusCode: 400,
        message: `${name} 中存在缺少链接地址的条目`,
      });
    }
  }
}

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const config = await getLayoutDefaultConfig();
    // 预设入口由服务端下发，前端不内置，避免预设数据进入客户端产物
    return { data: config, presets: LAYOUT_LINK_PRESETS };
  }

  if (method === "POST") {
    const body = (await readBody(event)) as
      | Partial<LayoutDefaultConfig>
      | undefined;
    if (!body || typeof body !== "object") {
      throw createError({ statusCode: 400, message: "配置内容不能为空" });
    }

    assertLinksValid(body.menuItems, "导航菜单");
    assertLinksValid(body.footerLinks, "底部链接");

    const saved = await saveLayoutDefaultConfig(body);

    // 前台接口带缓存，保存后立即失效，否则最长 30 分钟不生效
    await clearCacheNitroHandlers("layout-default-data");

    return { success: true, data: saved };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
