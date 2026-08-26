import { getConfigValue, setConfigValue } from "#server/lib/configCache";

export interface WechatConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  token: string;
  encodingAESKey: string;
  autoReplyEnabled: boolean;
  welcomeMessage: string;
  searchLimit: number;
  /** 验证文件内容（可选），通过上传 TXT 文件写入 */
  verifyFileName: string;
  verifyFileContent: string;
}

const DEFAULT_CONFIG: WechatConfig = {
  enabled: false,
  appId: "",
  appSecret: "",
  token: "",
  encodingAESKey: "",
  autoReplyEnabled: true,
  welcomeMessage: "谢谢关注！发送关键词即可搜索资源。",
  searchLimit: 100,
  verifyFileName: "",
  verifyFileContent: "",
};

export async function getWechatConfig(): Promise<WechatConfig> {
  const config = await getConfigValue("wechat_official_account");
  if (!config) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(config);
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    // 数字字段兜底
    if (!merged.searchLimit || merged.searchLimit < 1) merged.searchLimit = 100;
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveWechatConfig(data: WechatConfig): Promise<void> {
  await setConfigValue("wechat_official_account", JSON.stringify(data));
}
