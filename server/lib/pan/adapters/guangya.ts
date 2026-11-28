/**
 * 光鸭云盘适配器
 */
import { GuangyaClient } from "@netdisk-sdk/guangya-sdk";
import type { IGuangyaFile } from "@netdisk-sdk/guangya-sdk";
import type { H3Event, EventHandlerRequest } from "h3";
import type { PanAccount } from "#server/lib/accountCache";
import {
  disableSource,
  updateRefreshTokenByAccountId,
} from "#server/utils/source";
import { scheduleAdCleanup, filterAdFiles } from "../ad-filter";
import { renderTree, sortEntries } from "../tree";
import { paginate } from "../paginate";
import type {
  PanFile,
  ParsedShare,
  TransferContext,
  TransferResult,
} from "../types";
import type { DeleteItem, PanAdapter } from "./types";

type GuangyaFSApi = InstanceType<typeof GuangyaClient>["fsApi"];
type GuangyaShareApi = InstanceType<typeof GuangyaClient>["shareApi"];

/**
 * 列出光鸭个人盘目录下所有文件（分页聚合，page 从 0 起）
 */
async function listGuangyaDir(
  fsApi: GuangyaFSApi,
  parentId: string,
): Promise<IGuangyaFile[]> {
  const pageSize = 100;
  return paginate(
    0,
    async (page) => {
      const data = await fsApi.listFiles({ parentId, page, pageSize });
      const items = data?.list ?? [];
      return {
        items,
        nextCursor: items.length >= pageSize ? page + 1 : undefined,
      };
    },
    6, // 最多 5 页（page 0-5）
  );
}

/**
 * 列出光鸭分享下所有文件（分页聚合，page 从 1 起）
 */
async function listGuangyaShareFiles(
  shareApi: GuangyaShareApi,
  accessToken: string,
): Promise<IGuangyaFile[]> {
  const pageSize = 100;
  return paginate(
    1,
    async (page) => {
      const data = await shareApi.shareFilesList({
        accessToken,
        parentId: "",
        page,
        pageSize,
      });
      const items = data?.list ?? [];
      return {
        items,
        nextCursor: items.length >= pageSize ? page + 1 : undefined,
      };
    },
    19,
  );
}

/**
 * 光鸭个人盘目录列表（广告清理回调用）
 */
async function listFilesGuangya(
  fsApi: GuangyaFSApi,
  parentId: string,
  _isTop: boolean,
): Promise<PanFile[]> {
  const files = await listGuangyaDir(fsApi, parentId);
  return files.map((f) => ({
    id: f.fid,
    name: f.fileName,
    isDir: f.isDir,
  }));
}

/**
 * 光鸭云盘转存：获取访问令牌 → 列出分享文件 → 转存到专用目录 →
 * 前后快照 diff 得到新文件 → 创建新分享
 *
 * 注意：光鸭转存接口不返回新 fid，靠固定专用目录前后文件名 diff 对齐。
 */
async function transferGuangya(
  event: H3Event<EventHandlerRequest>,
  account: PanAccount,
  client: GuangyaClient,
  ctx: TransferContext,
): Promise<TransferResult> {
  const shareId = ctx.fid;
  const passcode = ctx.passcode;
  const sourceId = ctx.sourceId;
  const tempDirId = account.tempDir || "";
  const shareApi = client.shareApi;
  const fsApi = client.fsApi;

  // 步骤1: 校验分享是否存在
  const summary = await shareApi.shareSummary(shareId);
  if (summary.raw?.data?.shareStatus !== 1) {
    if (sourceId) {
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({
      statusCode: 404,
      message: summary.raw?.msg || "分享不存在或已失效",
    });
  }

  // 超过 100TB 不支持转存
  if (summary.raw?.data?.totalFileSize > 1024 * 1024 * 1024 * 1024 * 100) {
    if (sourceId) {
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({
      statusCode: 404,
      message: "分享不存在或已失效",
    });
  }

  // 步骤2: 获取分享访问令牌
  let accessToken = "";
  try {
    const tokenResult = await shareApi.shareAccessToken(shareId, passcode);
    accessToken = tokenResult.accessToken;
  } catch (err: any) {
    if (sourceId) {
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({
      statusCode: 404,
      message: "获取分享访问令牌失败：" + (err?.message || "未知错误"),
    });
  }

  if (!accessToken) {
    throw createError({ statusCode: 500, message: "分享访问令牌为空" });
  }

  // 步骤3: 列出分享文件
  const shareFiles = await listGuangyaShareFiles(shareApi, accessToken);
  if (shareFiles.length === 0) {
    if (sourceId) {
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({ statusCode: 404, message: "分享内容为空" });
  }
  const fileIds = shareFiles.map((f) => f.fid);

  // 步骤4: 转存前快照（按文件名去重）
  const beforeFiles = await listGuangyaDir(fsApi, tempDirId);
  const beforeNames = new Set(beforeFiles.map((f) => f.fileName));

  // 步骤5: 转存分享到专用目录
  const restoreResult = await shareApi.restoreShare({
    accessToken,
    fileIds,
    parentId: tempDirId,
  });

  // 步骤6: 等待转存任务完成（有 taskId 时轮询）
  if (restoreResult.taskId) {
    try {
      await shareApi.waitTask(restoreResult.taskId);
    } catch (err: any) {
      throw createError({
        statusCode: 500,
        message: "转存任务失败：" + (err?.message || "未知错误"),
      });
    }
  }

  // 步骤7: 转存后快照 + diff（按文件名对齐，找出新增文件）
  let newFiles: IGuangyaFile[] = [];
  for (let retry = 0; retry < 15; retry++) {
    const afterFiles = await listGuangyaDir(fsApi, tempDirId);
    newFiles = afterFiles.filter((f) => !beforeNames.has(f.fileName));
    if (newFiles.length > 0) break;
    // 转存可能有延迟，等待后重试
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (newFiles.length === 0) {
    throw createError({ statusCode: 500, message: "转存后未找到新增文件" });
  }

  const newFids = newFiles.map((f) => f.fid);

  // 异步删除广告文件（后台执行，不阻塞分享创建）
  await scheduleAdCleanup(event, {
    topFids: newFids,
    listChildren: (parentId, isTop) => listFilesGuangya(fsApi, parentId, isTop),
    remove: (ids) => fsApi.delete(ids),
  });

  // 步骤8: 创建新分享
  const title = shareFiles[0]?.fileName || "资源分享";
  const shareResult = await shareApi.createShare({
    fileIds: newFids,
    title,
  });

  if (!shareResult.shareUrl) {
    throw createError({ statusCode: 500, message: "创建分享失败" });
  }

  const shareUrl = shareResult.shareUrl;

  return { shareUrl, fids: newFids };
}

/**
 * 构建光鸭分享链接的文件树
 */
async function buildGuangyaTree(
  client: GuangyaClient,
  parsed: ParsedShare,
): Promise<string> {
  const shareId = parsed.fid;
  const passcode = parsed.passcode;

  // 获取分享访问令牌
  let accessToken = "";
  try {
    const tokenRes = await client.shareApi.shareAccessToken(shareId, passcode);
    accessToken = tokenRes.accessToken;
  } catch (e: any) {
    throw createError({
      statusCode: 404,
      message: `获取分享令牌失败: ${e.message || "未知错误"}`,
    });
  }

  if (!accessToken) {
    throw createError({ statusCode: 404, message: "获取分享令牌失败" });
  }

  return renderTree({
    rootId: "",
    listChildren: async (parentId) => {
      const pageSize = 100;
      const items = await paginate(
        1,
        async (page) => {
          const res = await client.shareApi.shareFilesList({
            accessToken,
            parentId,
            page,
            pageSize,
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
        name: item.fileName,
        isDir: item.isDir,
      }));
      return filterAdFiles(sortEntries(files));
    },
  });
}

/**
 * 光鸭：用户信息接口
 * fsApi.userInfo() → nickname / phone
 */
async function getGuangyaName(client: GuangyaClient): Promise<string> {
  const res = await client.fsApi.userInfo();
  const name = res.nickname || res.phone || "光鸭云盘用户";
  if (!name) throw new Error("未获取到昵称");
  return String(name);
}

export const guangyaAdapter: PanAdapter = {
  types: ["guangya"],
  clientClass: GuangyaClient,

  createClient(account: PanAccount) {
    if (!account.refreshToken) {
      throw createError({
        statusCode: 500,
        message: `账号 ${account.id} 未配置 Refresh Token，请先在账号管理中配置`,
      });
    }
    // device_id 复用 cookie 字段持久化，缺省时自动生成
    return new GuangyaClient({
      refreshToken: account.refreshToken,
      accessToken: account.accessToken || undefined,
      deviceId: account.cookie || undefined,
      expiresAt: account.expiresAt ? account.expiresAt.getTime() : undefined,
      onRefreshToken: (info) =>
        updateRefreshTokenByAccountId(account.id, {
          refreshToken: info.refreshToken || "",
          accessToken: info.accessToken,
          expiresAt: info.expiresAt || Date.now(),
        }),
    });
  },

  createTempClient(params) {
    if (!params.refreshToken) {
      throw createError({ statusCode: 400, message: "请先填写 Refresh Token" });
    }
    return new GuangyaClient({
      refreshToken: params.refreshToken,
      accessToken: params.accessToken || undefined,
      expiresAt: params.expiresAt ? params.expiresAt.getTime() : undefined,
    });
  },

  async listRootDirs(client) {
    const c = client as GuangyaClient;
    const res = await c.fsApi.listFiles({
      parentId: "",
      page: 0,
      pageSize: 100,
    });
    return (res.list || [])
      .filter((f) => f.isDir)
      .map((f) => ({ id: f.fid, name: f.fileName }));
  },

  async check(client) {
    const c = client as GuangyaClient;
    await c.fsApi.listFiles({ parentId: "", page: 0, pageSize: 1 });
  },

  getAccountName(client) {
    return getGuangyaName(client as GuangyaClient);
  },

  async deleteFiles(client, items: DeleteItem[]) {
    const c = client as GuangyaClient;
    await c.fsApi.delete(items.flatMap((i) => i.fids));
    if (items.length > 0) {
      await c.fsApi.clearRecycleBin();
    }
    return items.map((i) => i.id);
  },

  transfer(event, account, client, ctx) {
    return transferGuangya(event, account, client as GuangyaClient, ctx);
  },

  buildTree(client, parsed) {
    return buildGuangyaTree(client as GuangyaClient, parsed);
  },
};
