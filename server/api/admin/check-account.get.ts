import { getAccountById } from "#server/lib/accountCache";
import { getClientByAccount } from "#server/lib/pan-instance";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";

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

    if (client instanceof QuarkUCClient) {
      await client.fsApi.sort({ pdir_fid: "0", _size: 1 });
    } else if (client instanceof BaiduClient) {
      await client.fsApi.list({ dir: "/", num: 1 });
      await client.fsOpenApi.listall({ path: "/", start: 0, limit: 1 });
    } else {
      await client.fsApi.listFiles({ parentId: "", limit: 1 });
    }

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "账号检测失败",
    };
  }
});
