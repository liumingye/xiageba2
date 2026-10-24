import { prisma } from "#server/lib/prisma";
import {
  getLayoutDefaultConfig,
  type LayoutLinkItem,
} from "#server/lib/layoutConfig";

export interface PublicLayoutLink {
  label: string;
  to: string;
  /** lucide 图标名；空串表示未配置图标，前台不展示 */
  icon: string;
}

/**
 * 前台 default 布局装修数据（公开读接口）
 *
 * - 顶部导航 = 导航菜单
 * - 底部链接 = 底部链接（page 来源解析为 /page/<slug>）
 */
export default defineCachedEventHandler(
  async () => {
    const config = await getLayoutDefaultConfig();

    // 解析 page 来源条目 → 真实页面
    const pageItems = [...config.menuItems, ...config.footerLinks].filter(
      (i) => i.enabled && i.source === "page",
    );
    const byId = pageItems.filter((p) => p.ref).map((p) => p.ref);
    const bySlug = pageItems.filter((p) => !p.ref && p.slug).map((p) => p.slug);

    const or: { id?: { in: string[] }; slug?: { in: string[] } }[] = [];
    if (byId.length) or.push({ id: { in: byId } });
    if (bySlug.length) or.push({ slug: { in: bySlug } });

    const pages = or.length
      ? await prisma.page.findMany({
          where: { status: "PUBLISHED", OR: or },
          select: { id: true, slug: true, title: true, icon: true },
        })
      : [];

    const pageById = new Map(pages.map((p) => [p.id, p]));
    const pageBySlug = new Map(pages.map((p) => [p.slug, p]));

    const resolve = (list: LayoutLinkItem[]): PublicLayoutLink[] => {
      const result: PublicLayoutLink[] = [];
      for (const item of list) {
        if (!item.enabled) continue;

        if (item.source === "page") {
          const page = item.ref
            ? pageById.get(item.ref)
            : pageBySlug.get(item.slug);
          if (!page) continue;
          result.push({
            label: item.label || page.title,
            to: `/page/${page.slug}`,
            // 图标选填：条目未配置则不展示，不再回退页面图标
            icon: item.icon,
          });
          continue;
        }

        if (!item.label || !item.to) continue;
        result.push({
          label: item.label,
          to: item.to,
          // 图标选填：未配置则为空串，前台不展示图标
          icon: item.icon,
        });
      }
      return result;
    };

    return {
      data: {
        menuItems: resolve(config.menuItems),
        footerLinks: resolve(config.footerLinks),
      },
    };
  },
  {
    name: "layout-default-data",
    maxAge: 60 * 60,
    staleMaxAge: 2 * 60 * 60, // 强制过期
    swr: true,
  },
);
