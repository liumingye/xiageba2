import { getAccountById } from "#server/lib/accountCache";
import { getClientByAccount } from "#server/lib/pan-instance";
import { getAdapterByClient } from "#server/lib/pan/adapters";

export default defineEventHandler(async (event) => {
  const { accountId } = getQuery(event) as { accountId?: string };
  const id = parseInt(accountId || "", 10);

  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, message: "缺少 accountId 参数" });
  }

  const account = await getAccountById(id);
  if (!account) {
    throw createError({ statusCode: 404, message: "账号不存在" });
  }

  try {
    const client = await getClientByAccount(account);
    const adapter = getAdapterByClient(client);
    if (!adapter) {
      throw new Error("不支持的网盘类型");
    }
    await adapter.check(client);

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "账号检测失败",
    };
  }
});
