import { getConfigValues } from "#server/lib/configCache";
import axios from "axios";

interface PanCheckServer {
  url: string;
  password: string;
}

interface PanCheckCheckResult {
  submission_id: number;
  invalid_links: string[];
  locked_links: string[];
  pending_links: string[];
  valid_links: string[];
  invalid_format_count: number;
  duplicate_count: number;
}

interface PanCheckSubmissionResult {
  id: number;
  original_links: string[];
  pending_links: string[];
  valid_links: string[];
  selected_platforms: string[];
  status: string;
  total_duration: number;
  total_links: number;
  client_ip: string;
  browser: string;
  os: string;
  device: string;
  language: string;
  country: string;
  region: string;
  city: string;
  created_at: string;
  updated_at: string;
  checked_at: string;
}

/**
 * 获取配置的 PanCheck 服务器列表
 */
export const getPanCheckServers = async (): Promise<PanCheckServer[]> => {
  const cfg = await getConfigValues(["pancheck_servers"]);
  if (!cfg.pancheck_servers) return [];

  return cfg.pancheck_servers
    .split("\n")
    .filter((s: string) => s.trim())
    .map((s: string) => {
      const [url, password] = s.split("@@");
      return { url: url?.trim() || "", password: password?.trim() || "" };
    });
};

/**
 * 向 PanCheck 发起检测请求
 */
export const submitCheckRequest = async (
  links: string[],
): Promise<{ data: PanCheckCheckResult; idx: number } | null> => {
  const servers = await getPanCheckServers();
  if (servers.length === 0) return null;

  // 选择指定索引的服务器，或随机选择
  const idx = Math.floor(Math.random() * servers.length);
  const server = servers[idx];
  if (!server) return null;

  try {
    const res = await axios.post<PanCheckCheckResult>(
      `${server.url}/api/v1/links/check`,
      { links },
      {
        headers: {
          "Content-Type": "application/json",
          ...(server.password ? { "X-Admin-Password": server.password } : {}),
        },
        timeout: 15000,
      },
    );

    return { data: res.data, idx };
  } catch (err) {
    console.error("PanCheck submit error:", err);
    return null;
  }
};

/**
 * 查询 PanCheck 检测结果
 */
export const getCheckResult = async (
  serverUrl: string,
  submissionId: number,
  password?: string,
): Promise<PanCheckSubmissionResult | null> => {
  try {
    const res = await axios.get<PanCheckSubmissionResult>(
      `${serverUrl}/api/v1/links/submissions/${submissionId}`,
      {
        headers: {
          ...(password ? { "X-Admin-Password": password } : {}),
        },
        timeout: 10000,
      },
    );
    return res.data;
  } catch (err) {
    console.error("PanCheck get result error:", err);
    return null;
  }
};
