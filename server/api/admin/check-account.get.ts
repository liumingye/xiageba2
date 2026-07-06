import {
  getQuarkClient,
  getUCClient,
  getBaiduClient,
  getXunleiClient,
} from "#server/lib/pan";

const TYPE_NAMES: Record<string, string> = {
  quark: "夸克网盘",
  baidu: "百度网盘",
  uc: "UC 网盘",
  xunlei: "迅雷云盘",
};

export default defineEventHandler(async (event) => {
  const { type } = getQuery(event) as { type?: string };

  if (!type || !TYPE_NAMES[type]) {
    throw createError({ statusCode: 400, message: "不支持的网盘类型" });
  }

  try {
    switch (type) {
      case "quark": {
        const client = await getQuarkClient();
        await client.fsApi.sort({ pdir_fid: "0" });
        break;
      }
      case "baidu": {
        const client = await getBaiduClient();
        await client.fsApi.list({ dir: "/" });
        break;
      }
      case "uc": {
        const client = await getUCClient();
        await client.fsApi.sort({ pdir_fid: "0" });
        break;
      }
      case "xunlei": {
        const client = await getXunleiClient();
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
