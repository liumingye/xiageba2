// PanCheck 接口健康检测：服务端代理请求各接口，
// 同时探测 /api/v1/health 与 /api/v1/links/check，两个接口都可用才算有效，
// 避免浏览器直接跨域访问被 CORS 拦截
import axios from "axios";
import https from "https";

// 跳过 TLS 证书校验（支持自签名证书的 https 接口）
const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

const REQUEST_TIMEOUT = 8000;

// /api/v1/links/check 的探测载荷：用一个固定的夸克分享链接触发一次提交，
// 返回对象只要带 total_duration 字段（值可为 null）就说明检测服务可用
const LINKS_CHECK_PAYLOAD = {
  links: ["https://pan.quark.cn/s/45cfe8e10323"],
  selected_platforms: [
    "quark",
    "uc",
    "baidu",
    "tianyi",
    "pan123",
    "pan115",
    "aliyun",
    "xunlei",
    "cmcc",
  ],
};

interface ProbeResult {
  ok: boolean;
  status: string;
  message: string;
  durationMs: number;
}

const formatError = (e: any): string =>
  e?.code === "ECONNABORTED"
    ? `请求超时（${REQUEST_TIMEOUT / 1000} 秒）`
    : e?.message || "请求失败";

// 探测 /api/v1/health：2xx 且 status === "ok" 才算通过
const probeHealth = async (base: string): Promise<ProbeResult> => {
  const start = Date.now();
  try {
    const res = await axios.get(`${base}/api/v1/health`, {
      timeout: REQUEST_TIMEOUT,
      httpsAgent: insecureAgent,
      validateStatus: () => true,
    });
    const data: any = res.data;
    const ok = res.status >= 200 && res.status < 300 && data?.status === "ok";
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
      message: formatError(e),
      durationMs: Date.now() - start,
    };
  }
};

// 探测 /api/v1/links/check：2xx 且返回对象含 total_duration 字段才算通过
// （total_duration 的值不作要求：可能为 0 或 null，都算有效；
//   仅当字段完全不存在时才判失败）
const probeLinksCheck = async (base: string): Promise<ProbeResult> => {
  const start = Date.now();
  try {
    const res = await axios.post(
      `${base}/api/v1/links/check`,
      LINKS_CHECK_PAYLOAD,
      {
        timeout: REQUEST_TIMEOUT,
        httpsAgent: insecureAgent,
        validateStatus: () => true,
        headers: { "Content-Type": "application/json" },
      },
    );
    const data: any = res.data;
    // 只看键是否存在（null / 0 均有效），in 检查可区分「键不存在」与「值为 null」
    const hasTotalDuration =
      data !== null && typeof data === "object" && "total_duration" in data;
    const ok = res.status >= 200 && res.status < 300 && hasTotalDuration;
    return {
      ok,
      status: `HTTP ${res.status}`,
      message: ok
        ? ""
        : hasTotalDuration
          ? `HTTP ${res.status}`
          : "缺少 total_duration",
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: "error",
      message: formatError(e),
      durationMs: Date.now() - start,
    };
  }
};

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
      const start = Date.now();

      // 两个接口并发探测
      const [health, linksCheck] = await Promise.all([
        probeHealth(base),
        probeLinksCheck(base),
      ]);

      const ok = health.ok && linksCheck.ok;
      const failed: string[] = [];
      if (!health.ok) failed.push(`health: ${health.message || health.status}`);
      if (!linksCheck.ok) {
        failed.push(`links/check: ${linksCheck.message || linksCheck.status}`);
      }

      return {
        // 两个接口都可用才算有效
        ok,
        status: ok ? "ok" : "error",
        message: ok ? "" : failed.join("；"),
        durationMs: Date.now() - start,
        // 分项结果，便于定位是哪个接口异常
        health,
        linksCheck,
      };
    }),
  );

  return { success: true, results };
});
