import { getAccountById } from "#server/lib/accountCache";
import { getClientByAccount, createTempClient } from "#server/lib/pan-instance";
import type { PanClient } from "#server/lib/pan-instance";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { GuangyaClient } from "@netdisk-sdk/guangya-sdk";
import { C139Client } from "@netdisk-sdk/c139-sdk";

interface DirItem {
  id: string;
  name: string;
}

async function listDirs(client: PanClient): Promise<DirItem[]> {
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
  if (client instanceof XunleiClient) {
    const res = await client.fsApi.listFiles({
      parentId: "",
      limit: 100,
    });
    return (res.list || [])
      .filter((f) => f.is_dir)
      .map((f) => ({ id: f.id, name: f.name }));
  }

  // GuangyaClient
  if (client instanceof GuangyaClient) {
    const res = await client.fsApi.listFiles({
      parentId: "",
      page: 0,
      pageSize: 100,
    });
    return (res.list || [])
      .filter((f) => f.isDir)
      .map((f) => ({ id: f.fid, name: f.fileName }));
  }

  // C139Client
  if (client instanceof C139Client) {
    const test = client.aesDecrypt(
      Buffer.from("PVGDwmcvfs1uV3d1", "utf-8"),
      "wFJ71/ 3 JffCxTq15Do7sZ1gKvYPvkmrk4oZcjdj6bDkz5H7saJ/ P70UFj/ xZTQBl0yVCk79iHJRUp9zMn5+yXWHQ9N1rYboKUCI/ YjpI9ZTR0VTcLiED8+DYfVQPHYJEVT5vBeoigIqzdq0nkgO4t3ZQxP16NM9ChyDZUPRO2JjM9tX7mObRS/ 0 N83MI9uTaddoEOnQyoCk+IQwk9Fs1sL+145 lXMYQo6hQZIa/ MoDcnwyaswWUv/ Hhwnc/ XixS37lDe6/ Ovb+Wcpxts9sCAr6OrQZi9rsLvGnLLaRHZr0JTOTj14HpI4h45FbulMj/ DrRM3lH7B8afbLNWogoBwDs2nokV5WRIP/ wnd13HcSotsGIIh/ HJh+o31qIk7080Q0nXM9ECTw8KUsFHV8soitTSQ9fSCAViki005zHR0xJQ0VfvSJpkDQ4eKa8wXA+/yZdMJlX24ZTFFyww9plZKR/ L3acoIhlJsk9WNIwjKaET9WQv0UqNIlxrkChq96+ALSs9rdIKrtIaK2rVmsZ0fJLkML5U+82 mhcVWTYyTgWhEOHrCvq3fUH74qr1usUbBoI48yzTAJtu1Mc2Elqrm5Wt7kNIWImTrQLjWEoUue0DoBpsCGbYX4h83Cwsz+ayHyN4oMPo2lM14hHOpX5pnjroPh/ 31 zppd/ XIEJU6z454FiQUCrZx2MEp3uts7ccRzqJindiaoVp5RZBr4vgrMWf/ t7b086KPmYTtRiKYudSu1xG4iHPPURHqCDBhW24kl8",
    );
    console.log(test);
    // const test2 = await client.shareApi.getOutLinkTitle();
    // console.log(test2);
    const res = await client.fsApi.listFiles({
      parentFileId: "/",
      pageSize: 100,
    });
    return (res.list || [])
      .filter((f) => f.isDir)
      .map((f) => ({ id: f.fid, name: f.fileName }));
  }

  return [];
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
