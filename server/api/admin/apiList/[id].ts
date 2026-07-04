import { prisma } from "#server/lib/prisma";

const parseJson = (value: any, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeBody = (body: any) => ({
  name: String(body.name || "").trim(),
  type: ["api", "html", "pansou"].includes(body.type) ? body.type : "api",
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

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string;
  const method = event.method;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少ID" });
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const data = normalizeBody(body);

    if (!data.name) {
      throw createError({ statusCode: 400, message: "线路名称不能为空" });
    }
    if (!data.url) {
      throw createError({ statusCode: 400, message: "地址不能为空" });
    }

    const item = await prisma.apiList.update({ where: { id }, data });
    return { success: true, data: item };
  }

  if (method === "DELETE") {
    await prisma.apiList.delete({ where: { id } });
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
