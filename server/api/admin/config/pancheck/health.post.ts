// PanCheck 接口健康检测：服务端代理请求各接口的 /api/v1/health，
// 避免浏览器直接跨域访问被 CORS 拦截
import axios from "axios";
import https from "https";

// 跳过 TLS 证书校验（支持自签名证书的 https 接口）
const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const servers: string[] = Array.isArray(body?.servers) ? body.servers : [];

  if (!servers.length) {
    throw createError({ statusCode: 400, message: "未配置接口地址" });
  }

  const results = await Promise.all(
    servers.map(async (raw) => {
      const base = String(raw || "")
        .trim()
        .replace(/\/+$/, "");
      const url = `${base}/api/v1/health`;
      const start = Date.now();

      try {
        const res = await axios.get(url, {
          timeout: 8000,
          // 跳过证书校验，支持自签名 https 接口
          httpsAgent: insecureAgent,
          validateStatus: () => true,
        });

        const data: any = res.data;
        const ok =
          res.status >= 200 &&
          res.status < 300 &&
          data?.status === "ok";

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
            e?.code === "ECONNABORTED"
              ? "请求超时（8 秒）"
              : e?.message || "请求失败",
          durationMs: Date.now() - start,
        };
      }
    }),
  );

  return { success: true, results };
});
