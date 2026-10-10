/**
 * SEO 绝对地址工具
 */

/**
 * 转成绝对地址。
 * - 传入的已经是 http(s) 绝对地址（如 CDN 封面）时原样返回；
 * - 站内路径（/xxx）拼上站点 origin；
 * - 空值原样返回空串，交给业务侧 fallback。
 */
export function absoluteUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const origin = useRequestURL().origin;
  if (!origin) return path;
  return origin + (path.startsWith("/") ? path : `/${path}`);
}
