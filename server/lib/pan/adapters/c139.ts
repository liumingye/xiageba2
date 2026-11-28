/**
 * 中国移动云盘（139）适配器
 */
import { C139Client } from "@netdisk-sdk/c139-sdk";
import type { H3Event, EventHandlerRequest } from "h3";
import type { PanAccount } from "#server/lib/accountCache";
import { disableSource } from "#server/utils/source";
import { filterAdFiles } from "../ad-filter";
import { renderTree, sortEntries } from "../tree";
import type {
  PanFile,
  ParsedShare,
  TransferContext,
  TransferResult,
} from "../types";
import type { DeleteItem, PanAdapter } from "./types";

function requireCookie(cookie: string | undefined, message: string): string {
  if (!cookie) {
    throw createError({ statusCode: 500, message });
  }
  return cookie;
}

/**
 * 中国移动云盘转存：获取分享文件列表 → 创建转存任务 → 轮询完成 → 创建新分享
 */
async function transferC139(
  event: H3Event<EventHandlerRequest>,
  account: PanAccount,
  client: C139Client,
  ctx: TransferContext,
): Promise<TransferResult> {
  const linkId = ctx.fid;
  const passcode = ctx.passcode;
  const sourceId = ctx.sourceId;
  const tempDirId = account.tempDir || "";
  if (!tempDirId) {
    throw createError({ statusCode: 500, message: "账号未配置临时目录" });
  }

  const shareApi = client.shareApi;

  // 步骤1: 获取分享文件列表
  let shareResult = null;
  try {
    shareResult = await shareApi.getShareFiles({
      linkId,
      pcaId: "root",
      passwd: passcode,
    });
  } catch (err: any) {
    const info = typeof err?.info === "function" ? err.info() : undefined;
    // 9188 | 提取码非法
    // 200000727  | 外链不存在/外链被分享者取消
    if (sourceId && info && ["9188", "200000727"].includes(info.code)) {
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({
      statusCode: 500,
      message: info.desc || "获取分享文件列表失败",
    });
  }

  if (!shareResult.list || shareResult.list.length === 0) {
    // 分享内容为空，禁用资源
    if (sourceId) {
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({ statusCode: 404, message: "分享内容为空" });
  }

  const contentIds = shareResult.list.filter((f) => !f.isDir).map((f) => f.fid);
  const catalogIds = shareResult.list.filter((f) => f.isDir).map((f) => f.fid);

  // 步骤2: 创建转存任务
  const taskId = await shareApi.createTransferTask({
    coIdList: contentIds,
    catalogIdList: catalogIds,
    toFolderId: tempDirId,
    linkId,
  });
  if (!taskId) {
    throw createError({ statusCode: 500, message: "创建转存任务失败" });
  }

  // 步骤3: 等待转存完成
  const taskResult = await shareApi.waitTransferTask(taskId);
  if (Object.keys(taskResult.mapping).length === 0) {
    throw createError({ statusCode: 500, message: "转存后未获取到文件 ID" });
  }

  const fids = [
    ...taskResult.mapping.contentIds,
    ...taskResult.mapping.catalogIds,
  ];
  if (fids.length === 0) {
    throw createError({ statusCode: 500, message: "转存后未获取到文件 ID" });
  }

  // 步骤4: 创建新分享（区分文件 ID 和目录 ID）
  const shareName = shareResult.list[0]?.fileName || "资源分享";
  const newShare = await shareApi.createShare(
    shareName,
    taskResult.mapping.contentIds,
    taskResult.mapping.catalogIds,
  );

  let shareUrl = newShare.linkUrl;
  if (newShare.passwd) {
    shareUrl += `&${newShare.passwd}`;
  }

  return { shareUrl, fids };
}

/**
 * 构建 139 分享链接的文件树
 */
async function buildC139Tree(
  client: C139Client,
  parsed: ParsedShare,
): Promise<string> {
  const linkId = parsed.fid;
  const passcode = parsed.passcode;

  return renderTree({
    rootId: "root",
    listChildren: async (pcaId) => {
      let res;
      try {
        res = await client.shareApi.getShareFiles({
          linkId,
          pcaId,
          passwd: passcode,
        });
      } catch (e: any) {
        throw createError({
          statusCode: 404,
          message: `获取分享目录失败: ${e.message || "未知错误"}`,
        });
      }

      const files: PanFile[] = (res.list || []).map((item) => ({
        id: item.fid,
        name: item.fileName,
        isDir: item.isDir,
      }));
      return filterAdFiles(sortEntries(files));
    },
  });
}

/**
 * 139 云盘：从 cookie 解析账号（手机号）作为昵称
 * 无独立用户信息接口，直接使用 cookie 中的账号标识
 */
async function getC139Name(client: C139Client): Promise<string> {
  const account = client.getAccount();
  if (!account) throw new Error("未获取到账号信息");
  return String(account);
}

export const c139Adapter: PanAdapter = {
  types: ["c139"],
  clientClass: C139Client,

  createClient(account: PanAccount) {
    const cookie = requireCookie(
      account.cookie,
      `账号 ${account.id} 未配置 Cookie，请先在账号管理中配置`,
    );
    return new C139Client({ cookie });
  },

  createTempClient(params) {
    if (!params.cookie) {
      throw createError({ statusCode: 400, message: "请先填写 Cookie" });
    }
    return new C139Client({ cookie: params.cookie });
  },

  async listRootDirs(client) {
    const c = client as C139Client;
    const res = await c.fsApi.listFiles({
      parentFileId: "/",
      pageSize: 100,
    });
    return (res.list || [])
      .filter((f) => f.isDir)
      .map((f) => ({ id: f.fid, name: f.fileName }));
  },

  async check(client) {
    const c = client as C139Client;
    await c.fsApi.listFiles({ parentFileId: "/", pageSize: 1 });
  },

  getAccountName(client) {
    return getC139Name(client as C139Client);
  },

  async deleteFiles(client, items: DeleteItem[]) {
    const c = client as C139Client;
    await c.fsApi.batchTrash(items.flatMap((i) => i.fids));
    return items.map((i) => i.id);
  },

  transfer(event, account, client, ctx) {
    return transferC139(event, account, client as C139Client, ctx);
  },

  buildTree(client, parsed) {
    return buildC139Tree(client as C139Client, parsed);
  },
};
