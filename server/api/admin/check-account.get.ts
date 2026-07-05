import { getConfigValues } from "#server/lib/configCache";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { updateXunleiRefreshToken } from "#server/utils/source";

const TYPE_NAMES: Record<string, string> = {
  quark: "夸克网盘",
  baidu: "百度网盘",
  uc: "UC 网盘",
  xunlei: "迅雷云盘",
};

const COOKIE_KEYS: Record<string, string> = {
  quark: "quark_cookie",
  baidu: "baidu_cookie",
  uc: "uc_cookie",
  xunlei: "xunlei_refresh_token",
};

export default defineEventHandler(async (event) => {
  const { type } = getQuery(event) as { type?: string };

  if (!type || !TYPE_NAMES[type]) {
    throw createError({ statusCode: 400, message: "不支持的网盘类型" });
  }

  const configKey = COOKIE_KEYS[type];
  if (!configKey) {
    throw createError({ statusCode: 400, message: "不支持的网盘类型" });
  }

  const config = await getConfigValues([configKey]);
  const credential = config[configKey];

  if (!credential) {
    return { success: false, message: `${TYPE_NAMES[type]} 未配置凭据` };
  }

  try {
    switch (type) {
      case "quark": {
        const client = new QuarkUCClient({ type: "quark", cookie: credential });
        await client.fsApi.sort({ pdir_fid: "0" });
        break;
      }
      case "baidu": {
        const client = new BaiduClient(credential);
        await client.init();
        await client.fsApi.list({ dir: "/" });
        break;
      }
      case "uc": {
        const client = new QuarkUCClient({ type: "uc", cookie: credential });
        await client.fsApi.sort({ pdir_fid: "0" });
        break;
      }
      case "xunlei": {
        const client = new XunleiClient({
          refreshToken: credential,
          onRefreshToken: updateXunleiRefreshToken,
        });
        await client.fsApi.listFiles({ parentId: "" });
        break;
      }
    }
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "账号检测失败",
    };
  }
});
