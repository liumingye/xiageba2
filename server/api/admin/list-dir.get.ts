import { getAccountById } from "#server/lib/accountCache";
import { getClientByAccount, createTempClient } from "#server/lib/pan-instance";
import { getAdapterByClient } from "#server/lib/pan/adapters";
import type { PanClient } from "#server/lib/pan/adapters/types";

interface DirItem {
  id: string;
  name: string;
}

async function listDirs(client: PanClient): Promise<DirItem[]> {
  const adapter = getAdapterByClient(client);
  if (!adapter) return [];
  return adapter.listRootDirs(client);
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as {
    accountId?: string;
    type?: string;
    cookie?: string;
    refreshToken?: string;
    accessToken?: string;
  };

  try {
    let client: PanClient;

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
      client = await getClientByAccount(account);
    } else if (query.type) {
      // 临时凭证模式（添加账号时预览目录）— 复用 createTempClient
      client = await createTempClient({
        type: query.type,
        cookie: query.cookie,
        refreshToken: query.refreshToken,
        accessToken: query.accessToken,
      });
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
