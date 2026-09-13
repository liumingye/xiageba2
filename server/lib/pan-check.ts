import { getConfigValues } from "#server/lib/configCache";
import axios from "axios";
import https from "https";

/** PanCheck 单条链接的详细检测结果 */
export interface PanCheckLinkResult {
  link: string;
  platform: string;
  status: string;
  status_text: string;
  reason: string;
  verification_url: string;
  check_duration: number;
  is_rate_limited: boolean;
  is_password_protected: boolean;
}

export interface PanCheckCheckResult {
  submission_id: number; // 提交记录 ID
  invalid_links: string[]; // 失效链接
  locked_links: string[]; // 需要提取码但链接有效
  pending_links: string[]; // 待检测的链接
  valid_links: string[]; // 检测完成后的有效链接
  link_results?: PanCheckLinkResult[]; // 每条链接的详细检测结果，用于纠正汇总数组的误判
  total_duration: number;
  invalid_format_count: number;
  duplicate_count: number;

  server_id: number;
}

export type PanCheckLinkStatus = "valid" | "invalid" | "pending" | "unknown";

/** PanCheck 中明确表示链接已失效的 status 值 */
const INVALID_LINK_STATUSES = new Set([
  "invalid",
  "not_found",
  "deleted",
  "expired",
]);

/**
 * 判定单条链接的检测状态。
 *
 * PanCheck 的 invalid_links 会把「检测过程失败」的链接也算进去（例如迅雷
 * 返回 400、需要验证码或触发风控），这类链接本身并没有失效。因此当
 * link_results 中存在该链接的详细结果时以它为准：只要不是明确的失效状态，
 * 一律判定为有效。
 */
export const resolveLinkStatus = (
  link: string,
  result: PanCheckCheckResult,
): PanCheckLinkStatus => {
  const target = link.trim();
  const detail = result.link_results?.find(
    (item) => (item.link || "").trim() === target,
  );

  if (detail) {
    return INVALID_LINK_STATUSES.has(detail.status) ? "invalid" : "valid";
  }

  if (result.valid_links?.includes(link)) return "valid";
  if (result.invalid_links?.includes(link)) return "invalid";
  if (result.locked_links?.includes(link)) return "invalid";
  if (result.pending_links?.includes(link)) return "pending";

  return "unknown";
};

/**
 * 获取配置的 PanCheck 服务器地址列表
 */
const getPanCheckServers = async (): Promise<string[]> => {
  const cfg = await getConfigValues(["pancheck_servers"]);
  if (!cfg.pancheck_servers) return [];

  return cfg.pancheck_servers.split("\n").filter((s: string) => s.length > 0);
};

/**
 * 提交检测请求，PanCheck 会同步完成检测并直接返回结果
 */
export const submitCheckRequest = async (
  links: string[],
): Promise<PanCheckCheckResult | null> => {
  const servers = await getPanCheckServers();
  if (servers.length === 0) return null;

  // 随机选择一台服务器
  const server_id = Math.floor(Math.random() * servers.length);
  const serverUrl = servers[server_id];
  if (!serverUrl) return null;

  try {
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });
    const res = await axios.post<PanCheckCheckResult>(
      `${serverUrl.replace(/\/$/, "")}/api/v1/links/check`,
      {
        links,
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
      },
      {
        httpsAgent: agent,
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      },
    );
    return { ...res.data, server_id };
  } catch (err) {
    console.error("PanCheck submit error server: ", serverUrl, err);
    return null;
  }
};
