/**
 * apiList（搜索线路）配置的请求体规范化。
 *
 * 原 apiList/index.ts 与 apiList/[id].ts 各存了一份逐字重复的
 * parseJson + normalizeBody；新建与更新走同一套字段规则，
 * 收拢到此处单点维护。
 *
 * 纯函数，不依赖 h3 / Nitro 全局符号，可被 vitest 直接测。
 */

export interface ApiListBody {
  name: string;
  type: string;
  url: string;
  method: string;
  headers: string;
  fixed_params: string;
  field_map: string;
  count: number;
  html_item: string;
  html_title: string;
  html_url: number;
  html_type: string;
  html_url2: string;
  weight: number;
  status: number;
}

const API_LIST_TYPES = ["api", "html", "pansou"];

const parseJson = (value: unknown, fallback: unknown = {}) => {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value as string);
  } catch {
    return fallback;
  }
};

/** 把前端提交的线路配置规范化为 Prisma 可写的形状 */
export const normalizeApiListBody = (body: Record<string, any>): ApiListBody => ({
  name: String(body.name || "").trim(),
  type: API_LIST_TYPES.includes(body.type) ? body.type : "api",
  url: String(body.url || "").trim(),
  method: String(body.method || "GET").toUpperCase(),
  headers: JSON.stringify(parseJson(body.headers)),
  fixed_params: JSON.stringify(parseJson(body.fixed_params)),
  field_map: JSON.stringify(parseJson(body.field_map)),
  count: Math.max(1, parseInt(body.count) || 10),
  html_item: String(body.html_item || ""),
  html_title: String(body.html_title || ""),
  html_url: body.html_url === 1 || body.html_url === "1" ? 1 : 0,
  html_type: String(body.html_type || ""),
  html_url2: String(body.html_url2 || ""),
  weight: parseInt(body.weight) || 0,
  status: body.status === 0 || body.status === "0" ? 0 : 1,
});
