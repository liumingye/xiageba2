import { getAccountById } from "#server/lib/accountCache";
import { getClientByAccount } from "#server/lib/pan-instance";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET } from "#server/lib/const";

interface DirItem {
  id: string;
  name: string;
}

async function listDirs(client: QuarkUCClient | BaiduClient | XunleiClient): Promise<DirItem[]> {
  if (client instanceof QuarkUCClient) {
    const res = await client.fsApi.sort({
      pdir_fid: "0",
      _page: 1,
      _size: 100,
    });
    return (res.list || [])
      .filter((f) => f.file_type === 0)
      .map((f) => ({ id: f.fid, name: f.file_name }));
  }

  if (client instanceof BaiduClient) {
    const res = await client.fsApi.list({
      dir: "/",
      page: 1,
      num: 100,
      order: "name",
      desc: 0,
    });
    return (res.list || [])
      .filter((f) => f.isdir === 1)
      .map((f) => ({ id: f.path, name: f.server_filename }));
  }

  // XunleiClient
  const res = await client.fsApi.listFiles({
    parentId: "",
    limit: 100,
  });
  return (res.list || [])
    .filter((f) => f.is_dir)
    .map((f) => ({ id: f.id, name: f.name }));
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as {
    accountId?: string;
    type?: string;
    cookie?: string;
    refreshToken?: string;
    accessToken?: string;
  };

  let client: QuarkUCClient | BaiduClient | XunleiClient;

  try {
    if (query.accountId) {
      // 已有账号模式
      const id = parseInt(query.accountId, 10);
      if (!id || isNaN(id)) {
        throw createError({ statusCode: 400, message: "无效的 accountId" });
      }
      const account = await getAccountById(id);
      if (!account) {
        throw createError({ statusCode: 404, message: "账号不存在" });
      }
      client = (await getClientByAccount(account)) as
        | QuarkUCClient
        | BaiduClient
        | XunleiClient;
    } else if (query.type) {
      // 临时凭证模式（添加账号时预览目录）
      const type = query.type;
      const cookie = query.cookie || "";
      const refreshToken = query.refreshToken || "";
      const accessToken = query.accessToken || "";

      if (type === "quark" || type === "uc") {
        if (!cookie)
          throw createError({ statusCode: 400, message: "请先填写 Cookie" });
        client = new QuarkUCClient({ type, cookie });
      } else if (type === "baidu") {
        if (!cookie)
          throw createError({ statusCode: 400, message: "请先填写 Cookie" });
        const baiduClient = new BaiduClient({
          source: cookie,
          clientId: BAIDU_CLIENT_ID,
          clientSecret: BAIDU_CLIENT_SECRET,
          accessToken: accessToken || undefined,
          refreshToken: refreshToken || undefined,
        });
        await baiduClient.init();
        client = baiduClient;
      } else if (type === "xunlei") {
        if (!refreshToken)
          throw createError({
            statusCode: 400,
            message: "请先填写 Refresh Token",
          });
        client = new XunleiClient({
          refreshToken,
          accessToken: accessToken || undefined,
        });
      } else {
        throw createError({ statusCode: 400, message: "不支持的网盘类型" });
      }
    } else {
      throw createError({
        statusCode: 400,
        message: "缺少 accountId 或临时凭证",
      });
    }

    const dirs = await listDirs(client);
    return { list: dirs };
  } catch (error: any) {
    if (error.statusCode) throw error;
    throw createError({
      statusCode: 500,
      message: `获取目录列表失败: ${error.message || "未知错误"}`,
    });
  }
});
