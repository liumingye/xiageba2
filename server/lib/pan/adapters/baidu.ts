/**
 * 百度网盘适配器
 */
import {
  BaiduClient,
  parseShareParam,
} from "@netdisk-sdk/baidu-sdk";
import type {
  BaiduFSOpenApi,
  ITransferShareResult,
  ICreateShareResult,
  IFileManagerResult,
  IOpenApiFileManagerResult,
  IFile as IBaiduFile,
} from "@netdisk-sdk/baidu-sdk";
import type { H3Event, EventHandlerRequest } from "h3";
import type { PanAccount } from "#server/lib/accountCache";
import {
  disableSource,
  updateRefreshTokenByAccountId,
} from "#server/utils/source";
import { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET } from "#server/lib/const";
import { scheduleAdCleanup, filterAdFiles } from "../ad-filter";
import { renderTree, sortEntries, toIsDir } from "../tree";
import { paginate } from "../paginate";
import type {
  PanFile,
  ParsedShare,
  TransferContext,
  TransferResult,
} from "../types";
import type { DeleteItem, PanAdapter } from "./types";

/**
 * 列出百度个人盘目录下所有文件（分页聚合，最多 5 页）
 */
async function listFilesBaidu(
  fsApi: BaiduFSOpenApi,
  dirPath: string,
  _isTop: boolean,
): Promise<PanFile[]> {
  const limit = 500;

  const list = await paginate(
    0,
    async (start) => {
      const data = await fsApi.listall({
        path: dirPath,
        start,
        limit,
        order: "name",
        desc: 0,
      });
      const items = data?.list ?? [];
      return {
        items,
        nextCursor: data?.has_more ? data.cursor : undefined,
      };
    },
    5,
  );

  return list.map((file) => ({
    id: file.path || "",
    name: file.server_filename || "",
    isDir: toIsDir(file.isdir),
  }));
}

/**
 * 百度接口错误码 4（请求超时）重试，指数退避
 */
async function retryOnCode4<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {},
): Promise<T> {
  const { maxRetries = 2, delayMs = 1500 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const info = typeof err?.info === "function" ? err.info() : undefined;

      // code 4: 请求超时，请稍后再试

      const isCode4 = info?.errno === 4;
      const isLastAttempt = attempt === maxRetries;

      // 如果不是 code 4，或者达到了最大重试次数，直接向上抛出错误
      if (!isCode4 || isLastAttempt) {
        throw err;
      }

      // 计算延迟时间（指数退避：1s, 2s...）
      const waitTime = delayMs * Math.pow(2, attempt);
      console.warn(
        `[转存] 触发错误码 4，将在 ${waitTime}ms 后进行第 ${attempt + 1} 次重试...`,
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw new Error("转存失败：超过最大重试次数");
}

/**
 * 百度网盘转存：解析分享 → 获取文件列表 → 转存到临时目录 → 创建新分享
 */
async function transferBaidu(
  event: H3Event<EventHandlerRequest>,
  account: PanAccount,
  client: BaiduClient,
  ctx: TransferContext,
): Promise<TransferResult> {
  const _shareUrl = ctx.sourceUrl;
  const sourceId = ctx.sourceId;
  let tempDir = account.tempDir || "/";

  const shareParam = parseShareParam(_shareUrl);
  if (!shareParam) {
    throw createError({ statusCode: 500, message: "无效的百度分享链接" });
  }

  let shareInfo: any;
  try {
    shareInfo = await client.fsShareApi.wxlist({
      ...shareParam,
      dir: "/",
      page: 1,
      num: 1000,
      root: 1,
    });
  } catch (err: any) {
    // errtype: 0 | 啊哦，你来晚了，分享的文件已经被删除了，下次要早点哟。
    // errtype: 1 | 啊哦，你来晚了，分享的文件已经被取消了，下次要早点哟。
    // errtype: 3 | 此链接分享内容可能因为涉及侵权、色情、反动、低俗等信息，无法访问！
    const info = typeof err?.info === "function" ? err.info() : undefined;
    if (sourceId && info && [0, 1, 3].includes(info.errtype)) {
      // 禁用资源
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({ statusCode: 404, message: "文件违规或分享已过期" });
  }

  if (!shareInfo.list || shareInfo.list.length === 0) {
    throw createError({ statusCode: 404, message: "文件不存在或已被删除" });
  }

  const fsids = shareInfo.list.map((f: { fs_id: any }) => f.fs_id);

  let result: ITransferShareResult | null = null;

  try {
    result = await retryOnCode4(() =>
      client.fsShareApi.transfer(
        {
          shareid: shareInfo.shareid,
          from: shareInfo.uk,
          sekey: shareInfo.seckey,
        },
        tempDir,
        ...fsids,
      ),
    );
  } catch (err: any) {
    // 此时能捕获到所有的失败（包括重试失败和非 code 4 的错误）
    throw createError({ statusCode: 500, message: "请求超时，请稍后再试" });
  }

  if (!result) {
    throw createError({ statusCode: 500, message: "请求超时，请稍后再试" });
  }

  let list: {
    from: string;
    from_fs_id: number;
    to: string;
    to_fs_id: number;
  }[] = [];

  if (result.extra?.list) {
    // 转存任务已完成，直接使用结果
    list = result.extra.list;
  } else {
    // 等待转存完成
    const taskResult = await client.fsApi.taskquery(result.task_id, true);
    list = taskResult.list;
  }

  if (list.length === 0) {
    throw createError({ statusCode: 500, message: "分享内容为空" });
  }

  const fids = list.map((item) => item.to);

  const pwd = "6666";

  let shareResult: ICreateShareResult | null = null;

  try {
    shareResult = await retryOnCode4(() =>
      client.fsShareApi.createShare({
        fsidList: list.map((item) => item.to_fs_id),
        pwd,
        period: 1,
      }),
    );
  } catch (err: any) {
    // 此时能捕获到所有的失败（包括重试失败和非 code 4 的错误）
    throw createError({ statusCode: 500, message: "请求超时，请稍后再试" });
  }

  // 异步删除广告文件（后台执行，不阻塞分享创建）
  await scheduleAdCleanup(event, {
    topFids: fids,
    listChildren: (parentId, isTop) =>
      listFilesBaidu(client.fsOpenApi, parentId, isTop),
    remove: (ids) =>
      client.fsOpenApi.filemanager("delete", {
        async: 2,
        ondup: "fail",
        filelist: ids,
      }),
  });

  let shareUrl = shareResult.link;
  if (pwd) {
    shareUrl += `?pwd=${pwd}`;
  }

  return {
    shareUrl,
    fids,
  };
}

/**
 * 构建百度分享链接的文件树
 *
 * 百度的 seckey 是逐层下发的：子目录必须带父层响应里的 seckey。
 * 深度优先遍历保证父层一定先于子层被访问，用路径 → seckey 的映射即可还原。
 */
async function buildBaiduTree(
  client: BaiduClient,
  shareUrl: string,
): Promise<string> {
  const shareParam = parseShareParam(shareUrl);
  if (!shareParam) {
    throw createError({ statusCode: 404, message: "无效的百度分享链接" });
  }

  let rootInfo: any;
  try {
    rootInfo = await client.fsShareApi.wxlist({
      ...shareParam,
      dir: "/",
      page: 1,
      num: 200,
      root: 1,
    });
  } catch {
    throw createError({ statusCode: 404, message: "分享已过期" });
  }

  const sekeyByDir = new Map<string, string>([
    ["/", rootInfo.seckey || ""],
  ]);

  return renderTree({
    rootId: "/",
    listChildren: async (dir) => {
      const res = await client.fsShareApi.wxlist({
        ...shareParam,
        dir,
        page: 1,
        num: 200,
        root: dir === "/" ? 1 : 0,
        sekey: sekeyByDir.get(dir) || "",
        order: "name",
        desc: 0,
      } as any);

      const fileList: IBaiduFile[] = res.list || [];
      const currentSekey = res.seckey || sekeyByDir.get(dir) || "";
      for (const file of fileList) {
        if (toIsDir(file.isdir)) sekeyByDir.set(file.path, currentSekey);
      }

      const files: PanFile[] = fileList.map((file) => ({
        id: file.path,
        name: file.server_filename,
        isDir: toIsDir(file.isdir),
      }));
      return filterAdFiles(sortEntries(files));
    },
  });
}

/**
 * 百度：用户信息接口
 * https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo → netdisk_name | baidu_name
 */
async function getBaiduName(client: BaiduClient): Promise<string> {
  const res = await client.agentApi
    .get("https://pan.baidu.com/rest/2.0/xpan/nas")
    .query({ method: "uinfo" });

  const body = res.body;
  if (!body) throw new Error("未获取到账号信息");

  const name = body.netdisk_name || body.baidu_name || "";
  if (!name) throw new Error("未获取到昵称");
  return String(name);
}

export const baiduAdapter: PanAdapter = {
  types: ["baidu"],
  clientClass: BaiduClient,

  async createClient(account: PanAccount) {
    if (!account.cookie) {
      throw createError({
        statusCode: 500,
        message: `账号 ${account.id} 未配置 Cookie，请先在账号管理中配置`,
      });
    }
    try {
      const baiduClient = new BaiduClient({
        source: account.cookie,
        clientId: BAIDU_CLIENT_ID,
        clientSecret: BAIDU_CLIENT_SECRET,
        accessToken: account.accessToken || undefined,
        refreshToken: account.refreshToken || undefined,
        expiresAt: account.expiresAt ? account.expiresAt.getTime() : undefined,
        onRefreshToken: (tokenInfo) =>
          updateRefreshTokenByAccountId(account.id, tokenInfo),
      });
      await baiduClient.init();
      return baiduClient;
    } catch {
      throw createError({
        statusCode: 500,
        message: `账号 ${account.id} 初始化百度网盘客户端失败`,
      });
    }
  },

  async createTempClient(params) {
    if (!params.cookie) {
      throw createError({ statusCode: 400, message: "请先填写 Cookie" });
    }
    try {
      const baiduClient = new BaiduClient({
        source: params.cookie,
        clientId: BAIDU_CLIENT_ID,
        clientSecret: BAIDU_CLIENT_SECRET,
        accessToken: params.accessToken || undefined,
        refreshToken: params.refreshToken || undefined,
        expiresAt: params.expiresAt ? params.expiresAt.getTime() : undefined,
      });
      await baiduClient.init();
      return baiduClient;
    } catch {
      throw createError({
        statusCode: 500,
        message: "初始化百度网盘客户端失败",
      });
    }
  },

  async listRootDirs(client) {
    const c = client as BaiduClient;
    const res = await c.fsApi.list({
      dir: "/",
      page: 1,
      num: 100,
      order: "name",
      desc: 0,
    });
    // 百度 isdir 真机上不严格等于 1（出现过 "1"），必须宽容判定，
    // 否则子目录被当成文件过滤掉，临时目录只能选到根目录
    return (res.list || [])
      .filter((f) => toIsDir(f.isdir))
      .map((f) => ({ id: f.path, name: f.server_filename }));
  },

  async check(client) {
    const c = client as BaiduClient;
    await c.fsApi.list({ dir: "/", num: 1 });
    await c.fsOpenApi.listall({ path: "/", start: 0, limit: 1 });
  },

  getAccountName(client) {
    return getBaiduName(client as BaiduClient);
  },

  async deleteFiles(client, items: DeleteItem[], account: PanAccount) {
    const c = client as BaiduClient;
    let tempDir = account.tempDir;
    if (!tempDir) throw new Error("未配置百度网盘临时目录");
    if (!tempDir.startsWith("/")) tempDir = `/${tempDir}`;
    tempDir = tempDir.replace(/\/+/g, "/");

    const validChunkDbIds: number[] = [];
    const allPanPaths: string[] = [];

    for (const item of items) {
      let hasValidPath = false;
      for (let path of item.fids) {
        if (!path || typeof path !== "string") continue;
        if (!path.startsWith("/")) path = `/${path}`;
        path = path.replace(/\/+/g, "/");

        const cleanPath = path.replace(/\/$/, "");
        if (
          path === "/" ||
          cleanPath === tempDir ||
          !cleanPath.startsWith(tempDir)
        ) {
          continue;
        }
        // path可能需要encodeURIComponent
        allPanPaths.push(path);
        hasValidPath = true;
      }
      if (hasValidPath) {
        validChunkDbIds.push(item.id);
      }
    }

    if (allPanPaths.length > 0) {
      let task: IFileManagerResult | IOpenApiFileManagerResult | undefined;
      if (c.accessToken) {
        task = await c.fsOpenApi.filemanager("delete", {
          filelist: allPanPaths,
          async: 0,
        });
      } else {
        task = await c.fsApi.filemanager("delete", {
          filelist: allPanPaths,
        });
      }
      if (task.taskid) {
        await c.fsApi.taskquery(task.taskid, true);
      }
      return validChunkDbIds;
    }
    return items.map((i) => i.id);
  },

  transfer(event, account, client, ctx) {
    return transferBaidu(event, account, client as BaiduClient, ctx);
  },

  buildTree(client, parsed: ParsedShare) {
    return buildBaiduTree(client as BaiduClient, parsed.url);
  },
};
