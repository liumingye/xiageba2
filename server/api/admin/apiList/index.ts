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
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize as string) || 20),
    );
    const skip = (page - 1) * pageSize;
    const keyword = query.keyword as string | undefined;

    const where: any = {};
    if (keyword?.trim()) {
      where.OR = [
        { name: { contains: keyword.trim() } },
        { url: { contains: keyword.trim() } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.apiList.findMany({
        where,
        orderBy: [{ weight: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.apiList.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const data = normalizeBody(body);

    if (!data.name) {
      throw createError({ statusCode: 400, message: "线路名称不能为空" });
    }
    if (!data.url) {
      throw createError({ statusCode: 400, message: "地址不能为空" });
    }

    const item = await prisma.apiList.create({ data });
    return { success: true, data: item };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
