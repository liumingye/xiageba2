/**
 * 夸克/UC 网盘适配器（两家同 SDK 同流程，合并实现）
 */
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import type {
  QuarkUCFSApi,
  ISaveTaskStateResult,
} from "@netdisk-sdk/quarkuc-sdk";
import type { H3Event, EventHandlerRequest } from "h3";
import type { PanAccount } from "#server/lib/accountCache";
import { disableSource } from "#server/utils/source";
import { scheduleAdCleanup, filterAdFiles } from "../ad-filter";
import { renderTree } from "../tree";
import { paginate } from "../paginate";
import type {
  PanFile,
  ParsedShare,
  TransferContext,
  TransferResult,
} from "../types";
import type {
  DeleteItem,
  PanAdapter,
  TempCredentials,
} from "./types";

function requireCookie(cookie: string | undefined, message: string): string {
  if (!cookie) {
    throw createError({ statusCode: 500, message });
  }
  return cookie;
}

/**
 * 列出夸克/UC 个人盘目录下所有文件（分页聚合，最多 5 页）
 */
async function listFilesQuarkUC(
  fsApi: QuarkUCFSApi,
  pdirFid: string,
  isTop: boolean,
): Promise<PanFile[]> {
  const pageSize = 500;

  const list = await paginate(
    1,
    async (page) => {
      const data = await fsApi.sort({
        pdir_fid: pdirFid,
        _page: page,
        _size: pageSize,
      });
      const items = data?.list ?? [];
      return {
        items,
        nextCursor: items.length >= pageSize ? page + 1 : undefined,
      };
    },
    5,
  );

  // 顶级目录为空，可能不是目录，可能是文件
  if (list.length === 0 && isTop) {
    const info = await fsApi.info(pdirFid);
    if (info.file_type === 1) {
      return [{ id: info.fid, name: info.file_name || "", isDir: false }];
    }
    return [];
  }

  return list.map((file) => ({
    id: file.fid,
    name: file.file_name || "",
    isDir: file.file_type === 0,
  }));
}

/**
 * 夸克/UC网盘转存：获取分享token → 获取文件列表 → 转存到临时目录 → 创建新分享
 */
async function transferQuarkUC(
  event: H3Event<EventHandlerRequest>,
  account: PanAccount,
  client: QuarkUCClient,
  ctx: TransferContext,
): Promise<TransferResult> {
  // `41010` | 违规内容 | 文件涉及违规内容
  // `41012` | 分享已取消 | 好友已取消了分享
  // `41008` | 未提供提取码 | 当前分享链接需要提取码，请填写提取码。
  // `41007` | 提取码错误 | 提取码错误，请检查后再试。
  // `41009` | 分享文件已删除
  // `41005` | 选中的文件违规，不支持分享
  // `41026` | 选中的文件违规，不支持分享
  // `41011` | 分享地址已失效
  // `41031` | 分享者用户封禁链接查看受限
  // `41004` | 文件不存在
  const pwdId = ctx.fid;
  const passcode = ctx.passcode;
  const sourceId = ctx.sourceId;
  const tempDirId = account.tempDir || "";
  const shareApi = client.shareApi;

  // 步骤1: 获取stoken
  let token:
    | {
        stoken: string;
        title: string;
      }
    | undefined;
  try {
    token = await shareApi.token(pwdId, passcode);
  } catch (err: any) {
    // 处理分享不存在的情况
    const info = typeof err?.info === "function" ? err.info() : undefined;
    if (
      sourceId &&
      info &&
      [41012, 41010, 41007, 41008, 41011, 41031, 41004].includes(info.code)
    ) {
      // 禁用资源
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({ statusCode: 404, message: err.message });
  }

  if (!token?.stoken) {
    throw createError({ statusCode: 500, message: "获取stoken失败" });
  }

  // 步骤2: 转存分享
  const saveResult = await shareApi.save(pwdId, token.stoken, tempDirId);
  if (!saveResult.task_id) {
    throw createError({ statusCode: 500, message: "转存任务失败" });
  }

  // 步骤3: 等待转存完成
  let taskResult: ISaveTaskStateResult | null = null;
  try {
    taskResult = await shareApi.saveTask(saveResult.task_id, true);
  } catch (err: any) {
    const info = typeof err?.info === "function" ? err.info() : undefined;
    if (sourceId && info && [41009].includes(info.code)) {
      // 禁用资源
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({ statusCode: 500, message: `获取失败：${err.message}` });
  }
  if (!taskResult || taskResult.status === 0) {
    throw createError({ statusCode: 500, message: "获取失败：转存任务未完成" });
  }

  const saveAsTopFids =
    taskResult.save_as?.save_as_select_top_fids ||
    taskResult.save_as?.save_as_top_fids ||
    [];

  // 步骤4: 创建分享
  const shareResult = await shareApi.share(saveAsTopFids, token.title);
  if (!shareResult.task_id) {
    throw createError({
      statusCode: 500,
      message: "获取失败：创建分享任务失败",
    });
  }

  // 步骤5: 异步删除广告文件（后台执行，不阻塞分享创建）
  await scheduleAdCleanup(event, {
    topFids: saveAsTopFids,
    listChildren: (parentId, isTop) =>
      listFilesQuarkUC(client.fsApi, parentId, isTop),
    remove: (ids) => client.fsApi.delete(ids),
  });

  // 步骤6: 等待分享完成
  let share_task_data: ISaveTaskStateResult | null = null;
  try {
    share_task_data = await shareApi.saveTask(shareResult.task_id, true);
  } catch (err: any) {
    const info = typeof err?.info === "function" ? err.info() : undefined;
    // 选中的文件违规，不支持分享
    if (info && [41005, 41026].includes(info.code)) {
      if (sourceId) {
        // 禁用资源
        event.waitUntil(disableSource(sourceId));
        // 删除网盘内容
        event.waitUntil(client.fsApi.delete(saveAsTopFids));
      }
      throw createError({
        statusCode: 500,
        message: "禁止分享：文件违规，不支持分享",
      });
    }
  }

  if (!share_task_data || !share_task_data.share_id) {
    throw createError({
      statusCode: 500,
      message: "获取失败：分享后未获取到分享ID",
    });
  }

  // 步骤7: 获取分享密码
  const password_data = await shareApi.sharePassword(share_task_data.share_id);
  if (!password_data.share_url) {
    throw createError({
      statusCode: 500,
      message: "获取失败：获取分享密码失败",
    });
  }

  let shareUrl = password_data.share_url;

  //   如果有提取码，则拼接到分享链接中
  if (password_data.passcode) {
    shareUrl += `?pwd=${password_data.passcode}`;
  }

  return {
    shareUrl,
    fids: saveAsTopFids,
  };
}

/**
 * 构建夸克/UC 分享链接的文件树
 */
async function buildQuarkUCTree(
  client: QuarkUCClient,
  parsed: ParsedShare,
): Promise<string> {
  const pwdId = parsed.fid;
  const passcode = parsed.passcode;

  let stoken: string;
  try {
    const tokenRes = await client.shareApi.token(pwdId, passcode || undefined);
    stoken = tokenRes.stoken;
  } catch (e: any) {
    throw createError({
      statusCode: 404,
      message: `获取分享令牌失败: ${e.message || "未知错误"}`,
    });
  }

  if (!stoken) {
    throw createError({ statusCode: 404, message: "获取分享令牌失败" });
  }

  return renderTree({
    rootId: "0",
    listChildren: async (parentId) => {
      // 夸克api有限制pageSize最大100
      const pageSize = 100;
      const items = await paginate(
        1,
        async (page) => {
          const res = await client.shareApi.detail(pwdId, stoken, {
            pdir_fid: parentId,
            _page: page,
            _size: pageSize,
            _sort: ["file_type:asc", "file_name:asc"],
          });
          const list = res.list ?? [];
          return {
            items: list,
            nextCursor: list.length >= pageSize ? page + 1 : undefined,
          };
        },
        2,
      );

      const files: PanFile[] = items.map((item) => ({
        id: item.fid,
        name: item.file_name,
        isDir: item.file_type === 0,
      }));
      return filterAdFiles(files);
    },
  });
}

/**
 * 夸克/UC：账号信息接口
 * 夸克: https://pan.quark.cn/account/info → data.nickname
 * UC:   https://drive.uc.cn/account/info   → data.nickname
 */
async function getQuarkUCName(client: QuarkUCClient): Promise<string> {
  const { pr } = client.config;
  client.config.ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";
  const baseUrl =
    pr === "ucpro" ? "https://pan.quark.cn" : "https://drive.uc.cn";

  const res = await client.agentApi.get(`${baseUrl}/account/info`);

  const nickname = res.body?.data?.nickname;
  if (typeof nickname !== "string" || !nickname.trim()) {
    throw new Error("未获取到昵称");
  }
  return nickname.trim();
}

export const quarkUCAdapter: PanAdapter = {
  types: ["quark", "uc"],
  clientClass: QuarkUCClient,

  createClient(account: PanAccount) {
    const cookie = requireCookie(
      account.cookie,
      `账号 ${account.id} 未配置 Cookie，请先在账号管理中配置`,
    );
    return new QuarkUCClient({
      type: account.type as "quark" | "uc",
      cookie,
    });
  },

  createTempClient(params: TempCredentials) {
    if (!params.cookie) {
      throw createError({ statusCode: 400, message: "请先填写 Cookie" });
    }
    return new QuarkUCClient({
      type: params.type as "quark" | "uc",
      cookie: params.cookie,
    });
  },

  async listRootDirs(client) {
    const c = client as QuarkUCClient;
    const res = await c.fsApi.sort({
      pdir_fid: "0",
      _page: 1,
      _size: 100,
    });
    return (res.list || [])
      .filter((f) => f.file_type === 0)
      .map((f) => ({ id: f.fid, name: f.file_name }));
  },

  async check(client) {
    const c = client as QuarkUCClient;
    await c.fsApi.sort({ pdir_fid: "0", _size: 1 });
  },

  getAccountName(client) {
    return getQuarkUCName(client as QuarkUCClient);
  },

  async deleteFiles(client, items: DeleteItem[]) {
    const c = client as QuarkUCClient;
    const task = await c.fsApi.delete(items.flatMap((i) => i.fids));
    await c.fsApi.task(task.task_id, true);
    return items.map((i) => i.id);
  },

  transfer(event, account, client, ctx) {
    return transferQuarkUC(event, account, client as QuarkUCClient, ctx);
  },

  buildTree(client, parsed) {
    return buildQuarkUCTree(client as QuarkUCClient, parsed);
  },

  keepAlive(client) {
    (client as QuarkUCClient).keepAlive();
  },
};
