/**
 * 迅雷云盘适配器
 */
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import type { XunleiFSApi } from "@netdisk-sdk/xunlei-sdk";
import type { H3Event, EventHandlerRequest } from "h3";
import type { PanAccount } from "#server/lib/accountCache";
import {
  disableSource,
  updateRefreshTokenByAccountId,
} from "#server/utils/source";
import { scheduleAdCleanup, filterAdFiles } from "../ad-filter";
import { renderTree } from "../tree";
import { paginate } from "../paginate";
import type {
  PanFile,
  ParsedShare,
  TransferContext,
  TransferResult,
} from "../types";
import type { DeleteItem, PanAdapter } from "./types";

function requireRefreshToken(
  account: PanAccount,
): NonNullable<PanAccount["refreshToken"]> {
  if (!account.refreshToken) {
    throw createError({
      statusCode: 500,
      message: `账号 ${account.id} 未配置 Refresh Token，请先在账号管理中配置`,
    });
  }
  return account.refreshToken;
}

/**
 * 列出迅雷个人盘目录下所有文件（游标分页聚合，最多 5 页）
 */
async function listFilesXunlei(
  fsApi: XunleiFSApi,
  parentId: string,
  _isTop: boolean,
): Promise<PanFile[]> {
  const list = await paginate(
    "",
    async (pageToken) => {
      const data = await fsApi.listFiles({
        parentId,
        limit: 500,
        pageToken,
      });
      const items = data?.list ?? [];
      return {
        items,
        nextCursor: data?.next_page_token || undefined,
      };
    },
    5,
  );

  return list.map((file) => ({
    id: file.id,
    name: file.name || "",
    isDir: file.is_dir || false,
  }));
}

/**
 * 迅雷云盘转存：获取分享详情 → 转存到临时目录 → 等待任务 → 创建新分享
 */
async function transferXunlei(
  event: H3Event<EventHandlerRequest>,
  account: PanAccount,
  client: XunleiClient,
  ctx: TransferContext,
): Promise<TransferResult> {
  // share_status: SENSITIVE_RESOURCE | 分享包含敏感资源
  // share_status: EXPIRED | 分享已过期
  // share_status: DELETED | 分享已删除
  // share_status: PROHIBITED | 分享已被禁止
  // error_code: 7 | 暂无文件
  const shareId = ctx.fid;
  const passCode = ctx.passcode;
  const sourceId = ctx.sourceId;
  const tempDirId = account.tempDir || "";

  let detail: any;
  try {
    detail = await client.shareApi.getShare({ shareId, passCode });
  } catch (err: any) {
    const info = typeof err?.info === "function" ? err.info() : undefined;
    if (
      sourceId &&
      info &&
      (["SENSITIVE_RESOURCE", "EXPIRED", "DELETED", "PROHIBITED"].includes(
        info.share_status,
      ) ||
        [7].includes(info.error_code))
    ) {
      // 禁用资源
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({ statusCode: 404, message: "文件违规或分享已过期" });
  }

  if (detail.files.length === 0) {
    throw createError({
      statusCode: 404,
      message: "分享内容为空",
    });
  }

  const restoreResult = await client.shareApi.restore({
    shareId,
    passCodeToken: detail.passCodeToken,
    parentId: tempDirId,
    fileIds: detail.files.map((file: any) => file.id),
  });

  const task = await client.shareApi.waitTask(restoreResult.restore_task_id, {
    maxAttempts: 30,
    intervalMs: 1000,
  });

  const fileIds = client.shareApi.extractTraceFileIds(
    task.params?.trace_file_ids,
  );

  if (fileIds.length === 0) {
    throw createError({
      statusCode: 500,
      message: "xunlei task has no trace_file_ids",
    });
  }

  // 异步删除广告文件（后台执行，不阻塞分享创建）
  await scheduleAdCleanup(event, {
    topFids: fileIds,
    listChildren: (parentId, isTop) =>
      listFilesXunlei(client.fsApi, parentId, isTop),
    remove: (ids) => client.fsApi.delete(ids),
  });

  const shareResult = await client.shareApi.createShare({
    fileIds,
    title: detail.title,
    expirationDays: 1,
  });

  if (!shareResult.share_url) {
    throw createError({
      statusCode: 500,
      message: "获取分享链接失败",
    });
  }

  return {
    shareUrl:
      shareResult.share_url +
      (shareResult.pass_code ? "?pwd=" + shareResult.pass_code : ""),
    fids: fileIds,
  };
}

/**
 * 构建迅雷分享链接的文件树
 */
async function buildXunleiTree(
  client: XunleiClient,
  parsed: ParsedShare,
): Promise<string> {
  const shareId = parsed.fid;
  const passcode = parsed.passcode;

  if (!shareId) {
    throw createError({ statusCode: 404, message: "无效的迅雷分享链接" });
  }

  let detail: any;
  try {
    detail = await client.shareApi.getShare({
      shareId,
      passCode: passcode,
      limit: 200,
    });
  } catch {
    throw createError({ statusCode: 404, message: "分享已过期" });
  }

  if (detail.files.length === 0) {
    throw createError({ statusCode: 404, message: "分享内容为空" });
  }

  // 迅雷根目录的文件在 getShare 响应里直接给出，无需再请求
  const ROOT_ID = "";

  return renderTree({
    rootId: ROOT_ID,
    listChildren: async (parentId) => {
      const raw =
        parentId === ROOT_ID
          ? detail.files
          : (
              await client.shareApi.detail({
                shareId,
                passCodeToken: detail.passCodeToken,
                parentId,
                limit: 200,
              })
            ).files;

      const files: PanFile[] = raw.map(
        (f: { id: string; name: string; is_dir?: boolean }) => ({
          id: f.id,
          name: f.name,
          isDir: !!f.is_dir,
        }),
      );
      return filterAdFiles(files);
    },
  });
}

/**
 * 迅雷：用户信息接口
 * https://xluser-ssl.xunlei.com/v1/user/me → nickname | username | email
 */
async function getXunleiName(client: XunleiClient): Promise<string> {
  const accessToken = await client.getAccessToken();
  const res = await client.agent
    .get("https://xluser-ssl.xunlei.com/v1/user/me")
    .set({
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json, text/plain, */*",
    });

  const body = res.body;
  if (!body) throw new Error("未获取到账号信息");

  const name = body.name || body.email || "";
  if (!name) throw new Error("未获取到昵称");
  return String(name);
}

export const xunleiAdapter: PanAdapter = {
  types: ["xunlei"],
  clientClass: XunleiClient,

  createClient(account: PanAccount) {
    return new XunleiClient({
      refreshToken: requireRefreshToken(account),
      accessToken: account.accessToken || undefined,
      expiresAt: account.expiresAt ? account.expiresAt.getTime() : undefined,
      onRefreshToken: (tokenInfo) =>
        updateRefreshTokenByAccountId(account.id, tokenInfo),
    });
  },

  createTempClient(params) {
    if (!params.refreshToken) {
      throw createError({ statusCode: 400, message: "请先填写 Refresh Token" });
    }
    return new XunleiClient({
      refreshToken: params.refreshToken,
      accessToken: params.accessToken || undefined,
      expiresAt: params.expiresAt ? params.expiresAt.getTime() : undefined,
    });
  },

  async listRootDirs(client) {
    const c = client as XunleiClient;
    const res = await c.fsApi.listFiles({
      parentId: "",
      limit: 100,
    });
    return (res.list || [])
      .filter((f) => f.is_dir)
      .map((f) => ({ id: f.id, name: f.name }));
  },

  async check(client) {
    const c = client as XunleiClient;
    await c.fsApi.listFiles({ parentId: "", limit: 1 });
  },

  getAccountName(client) {
    return getXunleiName(client as XunleiClient);
  },

  async deleteFiles(client, items: DeleteItem[]) {
    const c = client as XunleiClient;
    await c.fsApi.delete(items.flatMap((i) => i.fids));
    return items.map((i) => i.id);
  },

  transfer(event, account, client, ctx) {
    return transferXunlei(event, account, client as XunleiClient, ctx);
  },

  buildTree(client, parsed) {
    return buildXunleiTree(client as XunleiClient, parsed);
  },
};
