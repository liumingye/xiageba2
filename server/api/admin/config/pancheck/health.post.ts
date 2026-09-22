// PanCheck 接口健康检测：服务端代理请求各接口的 /api/v1/health，
// 避免浏览器直接跨域访问被 CORS 拦截
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const servers: string[] = Array.isArray(body?.servers) ? body.servers : [];

  if (!servers.length) {
    throw createError({ statusCode: 400, message: "未配置接口地址" });
  }

  const results = await Promise.all(
    servers.map(async (raw) => {
      const base = String(raw || "").trim().replace(/\/+$/, "");
      const url = `${base}/api/v1/health`;
      const start = Date.now();

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        const data: any = await res.json().catch(() => null);
        const ok = res.ok && data?.status === "ok";

        return {
          ok,
          status: data?.status || `HTTP ${res.status}`,
          message: data?.message || (ok ? "" : "响应格式异常"),
          durationMs: Date.now() - start,
        };
      } catch (e: any) {
        return {
          ok: false,
          status: "error",
          message:
            e?.name === "AbortError"
              ? "请求超时（8 秒）"
              : e?.message || "请求失败",
          durationMs: Date.now() - start,
        };
      }
    }),
  );

  return { success: true, results };
});
