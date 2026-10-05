import { prisma } from "#server/lib/prisma";
import { getConfigValue } from "#server/lib/configCache";
import { decryptUrl } from "#server/lib/crypto";
import {
  parseShareParam,
  BaiduFSOpenApi,
  BaiduClient,
} from "@netdisk-sdk/baidu-sdk";
import type {
  ITransferShareResult,
  ICreateShareResult,
} from "@netdisk-sdk/baidu-sdk";
import {
  QuarkUCFSApi,
  QuarkUCClient,
  ISaveTaskStateResult,
} from "@netdisk-sdk/quarkUC-sdk";
import { XunleiFSApi, XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { getClientByAccount } from "#server/lib/pan-instance";
import { getRandomAccountByType } from "#server/lib/accountCache";
import type { PanAccount } from "#server/lib/accountCache";
import { THIRTY_MINUTES } from "#server/lib/const";
import {
  GETURL_DAILY_LIMIT,
  getClientIp,
  getTodayGeturlCount,
  incrementTodayGeturlCount,
} from "#server/lib/geturl-record";
import type { H3Event } from "h3";
import { automaton_ad_filter } from "#server/lib/simpleAC";

type NetdiskType = "quark" | "uc" | "baidu" | "xunlei" | "unknown";

interface AdFilterConfig {
  enabled: boolean;
  keywords: string;
}

const DEFAULT_AD_FILTER: AdFilterConfig = {
  enabled: false,
  keywords: "",
};

async function getAdFilterConfig(): Promise<AdFilterConfig> {
  const value = await getConfigValue("ad_filter");
  if (!value) return { ...DEFAULT_AD_FILTER };
  try {
    const parsed = JSON.parse(value);
    return { ...DEFAULT_AD_FILTER, ...parsed };
  } catch {
    return { ...DEFAULT_AD_FILTER };
  }
}

type PanSDKType = "quarkUC" | "xunlei" | "baidu";

interface PanFile {
  id: string;
  name: string;
  isDir: boolean;
}

const disableSource = async (sourceId: string) => {
  await prisma.source.update({
    where: { id: sourceId },
    data: {
      status: 0,
    },
  });
};

async function listFilesQuarkUC(
  fsApi: QuarkUCFSApi,
  pdirFid: string,
  isTop: boolean,
): Promise<PanFile[]> {
  const result: PanFile[] = [];
  let page = 1;
  const pageSize = 500;

  while (true) {
    const data = await fsApi.sort({
      pdir_fid: pdirFid,
      _page: page,
      _size: pageSize,
    });

    if (!data?.list || data.list.length === 0) {
      // 顶级目录为空，可能不是目录，可能是文件
      if (isTop) {
        const info = await fsApi.info(pdirFid);
        if (info.file_type === 1) {
          result.push({
            id: info.fid,
            name: info.file_name || "",
            isDir: false,
          });
        }
      }
      break;
    }

    for (const file of data.list) {
      result.push({
        id: file.fid,
        name: file.file_name || "",
        isDir: file.file_type === 0,
      });
    }

    if (data.list.length < pageSize) break;

    // 最多遍历5页
    if (page >= 5) break;
    page++;
  }

  return result;
}

async function listFilesXunlei(
  fsApi: XunleiFSApi,
  parentId: string,
  isTop: boolean,
): Promise<PanFile[]> {
  const result: PanFile[] = [];
  let pageToken = "";
  let page = 1;

  while (true) {
    const data = await fsApi.listFiles({
      parentId,
      limit: 500,
      pageToken,
    });
    if (!data?.list || data.list.length === 0) break;

    for (const file of data.list) {
      result.push({
        id: file.id,
        name: file.name || "",
        isDir: file.is_dir || false,
      });
    }

    if (!data.next_page_token) break;
    pageToken = data.next_page_token;

    // 最多遍历5页
    if (page >= 5) break;
    page++;
  }

  return result;
}

async function listFilesBaidu(
  fsApi: BaiduFSOpenApi,
  dirPath: string,
  isTop: boolean,
): Promise<PanFile[]> {
  const result: PanFile[] = [];
  let start = 0;
  const limit = 500;
  let page = 1;

  while (true) {
    const data = await fsApi.listall({
      path: dirPath,
      start,
      limit,
      order: "name",
      desc: 0,
    });
    if (!data?.list || data.list.length === 0) break;

    for (const file of data.list) {
      result.push({
        id: file.path || "",
        name: file.server_filename || "",
        isDir: file.isdir === 1,
      });
    }

    if (!data.has_more) break;
    start = data.cursor;

    // 最多遍历5页
    if (page >= 5) break;
    page++;
  }

  return result;
}

async function findAdFilesRecursive(
  fsApi: any,
  parentId: string,
  maxDepth: number,
  currentDepth: number,
  sdkType: PanSDKType,
): Promise<string[]> {
  if (!automaton_ad_filter) return [];

  const result: string[] = [];

  let listFn: (
    fsApi: any,
    parentId: string,
    isTop: boolean,
  ) => Promise<PanFile[]>;
  if (sdkType === "quarkUC") {
    listFn = listFilesQuarkUC;
  } else if (sdkType === "xunlei") {
    listFn = listFilesXunlei;
  } else {
    listFn = listFilesBaidu;
  }

  const files = await listFn(fsApi, parentId, false);

  for (const file of files) {
    const fileNameLower = file.name.toLowerCase();
    const isAd = automaton_ad_filter.hasMatch(fileNameLower);

    if (isAd) {
      result.push(file.id);
      continue;
    }

    if (file.isDir && currentDepth < maxDepth) {
      const childAdFiles = await findAdFilesRecursive(
        fsApi,
        file.id,
        maxDepth,
        currentDepth + 1,
        sdkType,
      );
      result.push(...childAdFiles);
    }
  }

  return result;
}

async function deleteAdFiles(
  fsApi: any,
  topFids: string[],
  sdkType: PanSDKType,
): Promise<void> {
  if (!automaton_ad_filter) return;

  const adFids: string[] = [];

  let listFn: (
    fsApi: any,
    parentId: string,
    isTop: boolean,
  ) => Promise<PanFile[]>;
  if (sdkType === "quarkUC") {
    listFn = listFilesQuarkUC;
  } else if (sdkType === "xunlei") {
    listFn = listFilesXunlei;
  } else {
    listFn = listFilesBaidu;
  }

  for (const fid of topFids) {
    try {
      const files = await listFn(fsApi, fid, true);

      for (const file of files) {
        const fileNameLower = file.name.toLowerCase();
        const isAd = automaton_ad_filter.hasMatch(fileNameLower);

        if (isAd) {
          adFids.push(file.id);
          continue;
        }

        if (file.isDir) {
          const childAdFiles = await findAdFilesRecursive(
            fsApi,
            file.id,
            2,
            1,
            sdkType,
          );
          adFids.push(...childAdFiles);
        }
      }
    } catch (e) {
      console.error("检查广告文件失败", fid, e);
    }
  }

  if (adFids.length > 0) {
    try {
      if (sdkType === "baidu") {
        await fsApi.filemanager("delete", {
          async: 2,
          ondup: "fail",
          filelist: adFids,
        });
      } else {
        await fsApi.delete(adFids);
      }
      console.log(`已删除 ${adFids.length} 个广告文件/目录 (${sdkType})`);
    } catch (e) {
      console.error("删除广告文件失败", e);
    }
  }
}

interface ParsedShare {
  type: NetdiskType;
  fid: string;
  passcode: string;
  url: string;
}

interface TransferShareUrlResult {
  url: string;
  transferred: boolean;
  error?: string;
}

// 🔒 内存进程锁（单实例高效防并发击穿）
const inflightRequests = new Map<string, Promise<TransferShareUrlResult>>();

// 提取白名单为全局 Set，O(1) 复杂度高性能判断
const ALLOWED_HOSTS = new Set([
  "pan.quark.cn",
  "pan.baidu.com",
  "drive.uc.cn",
  "fast.uc.cn",
  "pan.xunlei.com",
]);

/**
 * 解析分享链接，识别网盘类型并提取 fid 和提取码
 */
export function parseShareUrl(url: string): ParsedShare {
  const extractPwd = (u: string) => {
    const m = u.match(/(?:pwd=|password=|:|：|码)([a-zA-Z0-9]{4})/); // 严格限制提取码字符集，防正则穿透
    return m && m[1] ? m[1] : "";
  };

  // 夸克: https://pan.quark.cn/s/xxxx?pwd=yyyy
  let match = url.match(/pan\.quark\.cn\/s\/([a-zA-Z0-9-_]+)/);
  if (match && match[1])
    return { type: "quark", fid: match[1], passcode: extractPwd(url), url };

  // UC: https://drive.uc.cn/s/xxxx?pwd=yyyy
  match = url.match(/(?:drive|fast)\.uc\.cn\/s\/([a-zA-Z0-9-_]+)/);
  if (match && match[1])
    return { type: "uc", fid: match[1], passcode: extractPwd(url), url };

  // 百度: https://pan.baidu.com/s/xxxx?pwd=yyyy
  match = url.match(/pan\.baidu\.com\/s\/([a-zA-Z0-9-_]+)/);
  if (match && match[1])
    return { type: "baidu", fid: match[1], passcode: extractPwd(url), url };

  // 百度: 	https://pan.baidu.com/share/init?surl=xxxx?pwd=yyyy
  match = url.match(/pan\.baidu\.com\/share\/init\?surl=([a-zA-Z0-9-_]+)/);
  if (match && match[1])
    return {
      type: "baidu",
      fid: "1" + match[1],
      passcode: extractPwd(url),
      url,
    };

  // 迅雷: https://pan.xunlei.com/s/xxxx?pwd=yyyy
  match = url.match(/pan\.xunlei\.com\/s\/([a-zA-Z0-9-_]+)/);
  if (match && match[1])
    return { type: "xunlei", fid: match[1], passcode: extractPwd(url), url };

  return { type: "unknown", fid: "", passcode: "", url };
}

/**
 * 夸克/UC网盘转存：获取分享token → 获取文件列表 → 转存到临时目录 → 创建新分享
 * ponytail: quark 与 uc 同 SDK 同流程，合并实现
 */
async function transferQuarkUC(
  event: H3Event<EventHandlerRequest>,
  account: PanAccount,
  pwdId: string,
  passcode: string,
  sourceId?: string,
): Promise<{ shareUrl: string; fids: string[] }> {
  // `41010` | 违规内容 | 文件涉及违规内容
  // `41012` | 分享已取消 | 好友已取消了分享
  // `41008` | 未提供提取码 | 当前分享链接需要提取码，请填写提取码。
  // `41007` | 提取码错误 | 提取码错误，请检查后再试。
  // `41009` | 分享文件已删除
  // `41005` | 选中的文件违规，不支持分享
  // `41026` | 选中的文件违规，不支持分享
  const tempDirId = account.tempDir || "";
  const client = (await getClientByAccount(account)) as QuarkUCClient;
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
    if (sourceId && info && [41012, 41010, 41007, 41008].includes(info.code)) {
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
  const adFilterConfig = await getAdFilterConfig();
  if (adFilterConfig.enabled && saveAsTopFids.length > 0) {
    event.waitUntil(
      deleteAdFiles(client.fsApi, saveAsTopFids, "quarkUC").catch((e) =>
        console.error("异步删除广告文件失败", e),
      ),
    );
  }

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
 * 百度网盘转存：解析分享 → 获取文件列表 → 转存到临时目录 → 创建新分享
 */
async function transferBaidu(
  event: H3Event<EventHandlerRequest>,
  account: PanAccount,
  _shareUrl: string,
  sourceId?: string,
): Promise<{ shareUrl: string; fids: string[] }> {
  let tempDir = account.tempDir || "/";

  const client = (await getClientByAccount(account)) as BaiduClient;

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
    // errtype: 1 | 啊哦，你来晚了，分享的文件已经被取消了，下次要早点哟。
    // errtype: 3 | 此链接分享内容可能因为涉及侵权、色情、反动、低俗等信息，无法访问！
    const info = typeof err?.info === "function" ? err.info() : undefined;
    if (sourceId && info && [1, 3].includes(info.code)) {
      // 禁用资源
      event.waitUntil(disableSource(sourceId));
    }
    throw createError({ statusCode: 404, message: "文件违规或分享已过期" });
  }

  if (!shareInfo.list || shareInfo.list.length === 0) {
    throw createError({ statusCode: 404, message: "文件不存在或已被删除" });
  }

  const fsids = shareInfo.list.map((f: { fs_id: any }) => f.fs_id);

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

  // const pwd = shareParam.pwd || "6666";
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
  const adFilterConfig = await getAdFilterConfig();
  if (adFilterConfig.enabled && fids.length > 0) {
    event.waitUntil(
      deleteAdFiles(client.fsOpenApi, fids, "baidu").catch((e) =>
        console.error("异步删除广告文件失败", e),
      ),
    );
  }

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
 * 迅雷网盘转存：获取分享详情 → 转存到临时目录 → 等待任务 → 创建新分享
 */
async function transferXunlei(
  event: H3Event<EventHandlerRequest>,
  account: PanAccount,
  shareId: string,
  passCode: string,
  sourceId?: string,
): Promise<{ shareUrl: string; fids: string[] }> {
  // share_status: SENSITIVE_RESOURCE | 分享包含敏感资源
  // share_status: EXPIRED | 分享已过期
  // share_status: DELETED | 分享已删除
  // share_status: PROHIBITED | 分享已被禁止
  const tempDirId = account.tempDir || "";

  const client = (await getClientByAccount(account)) as XunleiClient;

  let detail: any;
  try {
    detail = await client.shareApi.getShare({ shareId, passCode });
  } catch (err: any) {
    const info = typeof err?.info === "function" ? err.info() : undefined;
    if (
      sourceId &&
      info &&
      ["SENSITIVE_RESOURCE", "EXPIRED", "DELETED", "PROHIBITED"].includes(
        info.share_status,
      )
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
  const adFilterConfig = await getAdFilterConfig();
  if (adFilterConfig.enabled && fileIds.length > 0) {
    event.waitUntil(
      deleteAdFiles(client.fsApi, fileIds, "xunlei").catch((e) =>
        console.error("异步删除广告文件失败", e),
      ),
    );
  }

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
 * 核心转存逻辑（可复用，供 wechat 等其他模块调用）
 * 输入原始分享链接，返回转存后的新分享链接（失败时返回原始链接）
 */
export async function transferShareUrl(
  event: H3Event<EventHandlerRequest>,
  sourceUrl: string,
  sourceId?: string,
): Promise<TransferShareUrlResult> {
  // 白名单清洗
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(hostname)) {
      return { url: sourceUrl, transferred: false };
    }
  } catch {
    return { url: sourceUrl, transferred: false, error: "链接格式无效" };
  }

  const parsedShare = parseShareUrl(sourceUrl);
  const { type, fid, passcode, url: sharePageUrl } = parsedShare;

  if (type === "unknown" || !fid) {
    return { url: sourceUrl, transferred: false };
  }

  // 随机选取一个该类型的启用账号
  const account = await getRandomAccountByType(type);
  if (!account) {
    return { url: sourceUrl, transferred: false, error: "无可用转存账号" };
  }

  let shareUrl: string;
  let _fid: string;

  try {
    if (type === "quark" || type === "uc") {
      const data = await transferQuarkUC(
        event,
        account,
        fid,
        passcode,
        sourceId,
      );
      shareUrl = data.shareUrl;
      _fid = JSON.stringify(data.fids);
    } else if (type === "baidu") {
      const data = await transferBaidu(event, account, sharePageUrl, sourceId);
      shareUrl = data.shareUrl;
      _fid = JSON.stringify(data.fids);
    } else if (type === "xunlei") {
      const data = await transferXunlei(
        event,
        account,
        fid,
        passcode,
        sourceId,
      );
      shareUrl = data.shareUrl;
      _fid = JSON.stringify(data.fids);
    } else {
      return { url: sourceUrl, transferred: false, error: "未实现的网盘类型" };
    }
  } catch (e: any) {
    // 失效计数
    if (e.statusCode === 404 && sourceId) {
      prisma.source
        .update({
          where: { id: sourceId },
          data: { invalidNum: { increment: 1 } },
        })
        .catch(() => {});
    }

    throw createError({ statusCode: 500, message: e.message || "转存失败" });
  }

  // 异步落库
  event.waitUntil(
    prisma.sourceTemp
      .create({
        data: { url: shareUrl, fid: _fid, accountId: account.id },
      })
      .catch((err) => console.error("落库失败", err)),
  );

  // 写入 Redis 缓存
  const cacheKey = sourceId
    ? `source:id:${sourceId}`
    : `source:url:${Buffer.from(sourceUrl).toString("base64").substring(0, 40)}`;
  await setRedisCache(cacheKey, shareUrl, Math.max(THIRTY_MINUTES - 300, 60));

  return { url: shareUrl, transferred: true };
}

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    throw createError({ statusCode: 403, message: "请求方法错误" });
  }

  const body = await readBody(event);
  let inputUrl = body.url as string | undefined;
  let id = body.id as string | undefined;

  if (!inputUrl && !id) {
    throw createError({ statusCode: 400, message: "缺少参数 url 或 id" });
  }

  if (inputUrl && id) {
    throw createError({ statusCode: 400, message: "同时传入 url 和 id 无效" });
  }

  const clientIp = getClientIp(event);
  let sourceUrl = "";

  if (inputUrl) {
    const decryptedUrl = await decryptUrl(inputUrl);
    if (!decryptedUrl)
      throw createError({ statusCode: 400, message: "链接解密失败" });
    sourceUrl = decryptedUrl;
  }

  const cacheKey = id ? `source:id:${id}` : `source:url:${sourceUrl}`;

  // 🚀 一级防御：读取大并发下的分布式 Redis 缓存
  const redisCache = await getRedisCache<string>(cacheKey);
  if (redisCache !== null) {
    return { url: redisCache, cache: "redis" };
  }

  // 🔒 二级防御：并发互斥单飞锁（防止击穿网盘 SDK 和账号限制）
  if (inflightRequests.has(cacheKey)) {
    // transferShareUrl 解析为 TransferShareUrlResult，必须取出其中的 url 字符串，
    // 否则前端拿到的 data.url 是一个对象，下载弹窗会显示 [object Object]
    const result = await inflightRequests.get(cacheKey);
    if (result) {
      return { url: result.url, cache: "inflight" };
    }
  }

  if (id) {
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source || source.status === 0)
      throw createError({ statusCode: 404, message: "文件不存在或已被删除" });
    if (source.isSelf) {
      return { url: source.url };
    }
    sourceUrl = source.url;
  }

  if (!sourceUrl) throw createError({ statusCode: 400, message: "链接为空" });

  // 🛡️ IP 今日 geturl 记录限流：超过上限不再转存，直接返回原始链接
  const parsedShare = parseShareUrl(sourceUrl);
  const netdiskType = parsedShare.type;

  const todayCount = await getTodayGeturlCount(clientIp, netdiskType);
  if (todayCount >= GETURL_DAILY_LIMIT) {
    return { url: sourceUrl };
  }

  // 构建核心转存处理链条
  const transferPromise = transferShareUrl(event, sourceUrl, id);

  // 将 Promise 送入全局互斥拦截器
  inflightRequests.set(cacheKey, transferPromise);

  try {
    const result = await transferPromise;
    // 记录 IP 今日 geturl 次数（异步，不阻塞响应）
    event.waitUntil(incrementTodayGeturlCount(clientIp, netdiskType));
    return { url: result.url };
  } finally {
    inflightRequests.delete(cacheKey);
  }
});
