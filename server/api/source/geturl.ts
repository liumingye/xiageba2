import { prisma } from "#server/lib/prisma";
import { getConfigValues, getConfigValue } from "#server/lib/configCache";
import { decryptUrl } from "#server/lib/crypto";
import { parseShareParam, BaiduFSOpenApi } from "@netdisk-sdk/baidu-sdk";
import { QuarkUCFSApi } from "@netdisk-sdk/quarkUC-sdk";
import { XunleiFSApi } from "@netdisk-sdk/xunlei-sdk";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import {
  getQuarkClient,
  getUCClient,
  getBaiduClient,
  getXunleiClient,
} from "#server/lib/pan-instance";

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

async function listFilesQuarkUC(
  fsApi: QuarkUCFSApi,
  pdirFid: string,
): Promise<PanFile[]> {
  const result: PanFile[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const data = await fsApi.sort({
      pdir_fid: pdirFid,
      _page: page,
      _size: pageSize,
    });
    if (!data?.list || data.list.length === 0) break;

    for (const file of data.list) {
      result.push({
        id: file.fid,
        name: file.file_name || "",
        isDir: file.file_type === 0,
      });
    }

    if (data.list.length < pageSize) break;
    page++;
  }

  return result;
}

async function listFilesXunlei(
  fsApi: XunleiFSApi,
  parentId: string,
): Promise<PanFile[]> {
  const result: PanFile[] = [];
  let pageToken = "";

  while (true) {
    const data = await fsApi.listFiles({
      parentId,
      limit: 100,
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
  }

  return result;
}

async function listFilesBaidu(
  fsApi: BaiduFSOpenApi,
  dirPath: string,
): Promise<PanFile[]> {
  const result: PanFile[] = [];
  let start = 0;
  const limit = 100;

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
  }

  return result;
}

async function findAdFilesRecursive(
  fsApi: any,
  parentId: string,
  keywords: string[],
  maxDepth: number,
  currentDepth: number,
  sdkType: PanSDKType,
): Promise<string[]> {
  const result: string[] = [];

  let listFn: (fsApi: any, parentId: string) => Promise<PanFile[]>;
  if (sdkType === "quarkUC") {
    listFn = listFilesQuarkUC;
  } else if (sdkType === "xunlei") {
    listFn = listFilesXunlei;
  } else {
    listFn = listFilesBaidu;
  }

  const files = await listFn(fsApi, parentId);

  for (const file of files) {
    const fileNameLower = file.name.toLowerCase();
    const isAd = keywords.some((kw) => fileNameLower.includes(kw));

    if (isAd) {
      result.push(file.id);
      continue;
    }

    if (file.isDir && currentDepth < maxDepth) {
      const childAdFiles = await findAdFilesRecursive(
        fsApi,
        file.id,
        keywords,
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
  config: AdFilterConfig,
  sdkType: PanSDKType,
): Promise<void> {
  if (!config.enabled || !config.keywords.trim()) return;

  const keywords = config.keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);

  if (keywords.length === 0) return;

  const adFids: string[] = [];

  let listFn: (fsApi: any, parentId: string) => Promise<PanFile[]>;
  if (sdkType === "quarkUC") {
    listFn = listFilesQuarkUC;
  } else if (sdkType === "xunlei") {
    listFn = listFilesXunlei;
  } else {
    listFn = listFilesBaidu;
  }

  for (const fid of topFids) {
    try {
      const files = await listFn(fsApi, fid);
      if (files.length === 0) {
        const fileName = "";
        const fileNameLower = fileName.toLowerCase();
        const isAd = keywords.some((kw) => fileNameLower.includes(kw));
        if (isAd) {
          adFids.push(fid);
          continue;
        }
      }

      for (const file of files) {
        const fileNameLower = file.name.toLowerCase();
        const isAd = keywords.some((kw) => fileNameLower.includes(kw));

        if (isAd) {
          adFids.push(file.id);
          continue;
        }

        if (file.isDir) {
          const childAdFiles = await findAdFilesRecursive(
            fsApi,
            file.id,
            keywords,
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

// 🔒 内存进程锁（单实例高效防并发击穿）
const inflightRequests = new Map<string, Promise<{ url: string }>>();

// 提取白名单为全局 Set，O(1) 复杂度高性能判断
const ALLOWED_HOSTS = new Set([
  "pan.quark.cn",
  "pan.baidu.com",
  "drive.uc.cn",
  "pan.xunlei.com",
]);

/**
 * 解析分享链接，识别网盘类型并提取 fid 和提取码
 */
export function parseShareUrl(url: string): ParsedShare {
  const extractPwd = (u: string) => {
    const m = u.match(/[?&]pwd=([a-zA-Z0-9]+)/); // 严格限制提取码字符集，防正则穿透
    return m && m[1] ? m[1] : "";
  };

  // 夸克: https://pan.quark.cn/s/xxxx?pwd=yyyy
  let match = url.match(/pan\.quark\.cn\/s\/([^/?#]+)/);
  if (match && match[1])
    return { type: "quark", fid: match[1], passcode: extractPwd(url), url };

  // UC: https://drive.uc.cn/s/xxxx?pwd=yyyy
  match = url.match(/drive\.uc\.cn\/s\/([^/?#]+)/);
  if (match && match[1])
    return { type: "uc", fid: match[1], passcode: extractPwd(url), url };

  // 百度: https://pan.baidu.com/s/xxxx?pwd=yyyy
  match = url.match(/pan\.baidu\.com\/s\/([^/?#]+)/);
  if (match && match[1])
    return { type: "baidu", fid: match[1], passcode: extractPwd(url), url };

  // 百度: 	https://pan.baidu.com/share/init?surl=xxxx&pwd=yyyy
  match = url.match(/pan\.baidu\.com\/share\/init\?surl=([^&]+)/);
  if (match && match[1])
    return {
      type: "baidu",
      fid: "1" + match[1],
      passcode: extractPwd(url),
      url,
    };

  // 迅雷: https://pan.xunlei.com/s/xxxx?pwd=yyyy
  match = url.match(/pan\.xunlei\.com\/s\/([^/?#]+)/);
  if (match && match[1])
    return { type: "xunlei", fid: match[1], passcode: extractPwd(url), url };

  return { type: "unknown", fid: "", passcode: "", url };
}

/**
 * 夸克/UC网盘转存：获取分享token → 获取文件列表 → 转存到临时目录 → 创建新分享
 * ponytail: quark 与 uc 同 SDK 同流程，仅 type 与 config key 不同，合并实现
 */
async function transferQuarkUC(
  type: "quark" | "uc",
  pwdId: string,
  passcode: string,
): Promise<{ shareUrl: string; fids: string[] }> {
  const config = await getConfigValues([`${type}_temp_dir`]);
  const tempDirId = config[`${type}_temp_dir`] || "";
  const client =
    type === "quark" ? await getQuarkClient() : await getUCClient();
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
  } catch (e: any) {
    // 处理分享不存在的情况
    throw createError({ statusCode: 404, message: e.message });
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
  let taskResult = await shareApi.saveTask(saveResult.task_id, true);
  if (taskResult.status === 0) {
    throw createError({ statusCode: 500, message: "转存任务未完成" });
  }

  const saveAsTopFids = taskResult.save_as?.save_as_top_fids || [];

  // 步骤4: 异步删除广告文件（后台执行，不阻塞分享创建）
  const adFilterConfig = await getAdFilterConfig();
  if (adFilterConfig.enabled && saveAsTopFids.length > 0) {
    deleteAdFiles(client.fsApi, saveAsTopFids, adFilterConfig, "quarkUC").catch(
      (e) => console.error("异步删除广告文件失败", e),
    );
  }

  // 步骤5: 创建分享
  const shareResult = await shareApi.share(saveAsTopFids, token.title);
  if (!shareResult.task_id) {
    throw createError({ statusCode: 500, message: "创建分享任务失败" });
  }

  // 步骤6: 等待分享完成
  const share_task_data = await shareApi.saveTask(shareResult.task_id, true);
  if (!share_task_data.share_id) {
    throw createError({ statusCode: 500, message: "分享后未获取到分享ID" });
  }

  // 步骤7: 获取分享密码
  const password_data = await shareApi.sharePassword(share_task_data.share_id);
  if (!password_data.share_url) {
    throw createError({ statusCode: 500, message: "获取分享密码失败" });
  }

  const shareFid = share_task_data.save_as.save_as_top_fids;

  return {
    shareUrl: password_data.share_url,
    fids: shareFid.length > 0 ? shareFid : [password_data.first_file.fid],
  };
}

/**
 * 百度网盘转存：解析分享 → 获取文件列表 → 转存到临时目录 → 创建新分享
 */
async function transferBaidu(
  _shareUrl: string,
): Promise<{ shareUrl: string; fids: string[] }> {
  const config = await getConfigValues(["baidu_temp_dir"]);
  const tempDir = config.baidu_temp_dir || "/";

  const client = await getBaiduClient();

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
  } catch (err) {
    throw createError({ statusCode: 404, message: "分享已过期" });
  }

  if (!shareInfo.list || shareInfo.list.length === 0) {
    throw createError({ statusCode: 404, message: "分享内容为空" });
  }

  const fsids = shareInfo.list.map((f: { fs_id: any }) => f.fs_id);
  const result = await client.fsShareApi.transfer(
    {
      shareid: shareInfo.shareid,
      from: shareInfo.uk,
      sekey: shareInfo.seckey,
    },
    tempDir,
    ...fsids,
  );

  if (!result.extra.list || result.extra.list.length === 0) {
    throw createError({ statusCode: 500, message: "分享内容为空" });
  }

  let fids: string[] = [];
  if (result.info) {
    fids = result.info.map((item) => tempDir + item.path);
  }

  // 异步删除广告文件（后台执行，不阻塞分享创建）
  const adFilterConfig = await getAdFilterConfig();
  if (adFilterConfig.enabled && fids.length > 0) {
    deleteAdFiles(client.fsOpenApi, fids, adFilterConfig, "baidu").catch((e) =>
      console.error("异步删除广告文件失败", e),
    );
  }

  const pwd = shareParam.pwd || "6666";
  const shareResult = await client.fsShareApi.createShare({
    fsidList: result.extra.list.map((item) => item.to_fs_id),
    pwd,
    period: 1,
  });

  let shareUrl = shareResult.link;
  if (pwd) {
    shareUrl += `&pwd=${pwd}`;
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
  shareId: string,
  passCode: string,
): Promise<{ shareUrl: string; fids: string[] }> {
  const config = await getConfigValues(["xunlei_temp_dir"]);
  const tempDirId = config.xunlei_temp_dir || "";

  const client = await getXunleiClient();

  let detail: any;
  try {
    detail = await client.shareApi.getShare({ shareId, passCode });
  } catch (e) {
    throw createError({ statusCode: 404, message: "分享已过期" });
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
    deleteAdFiles(client.fsApi, fileIds, adFilterConfig, "xunlei").catch((e) =>
      console.error("异步删除广告文件失败", e),
    );
  }

  const shareResult = await client.shareApi.createShare({
    fileIds,
    title: detail.title,
    expirationDays: 7,
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

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  let inputUrl = query.url as string | undefined;
  let id = query.id as string | undefined;

  if (event.method === "POST") {
    const body = await readBody(event);
    if (body.url) inputUrl = body.url;
    if (body.id) id = body.id;
  }

  if (!inputUrl && !id) {
    throw createError({ statusCode: 400, message: "缺少参数 url 或 id" });
  }

  let sourceTitle = "临时资源";
  let sourceUrl = "";

  // 1. 快速获取源站 URL
  if (id) {
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source) throw createError({ statusCode: 404, message: "资源不存在" });
    if (source.isSelf) {
      return { url: source.url };
    }
    sourceTitle = source.title;
    sourceUrl = source.url;
  } else if (inputUrl) {
    const decryptedUrl = await decryptUrl(inputUrl);
    if (!decryptedUrl)
      throw createError({ statusCode: 400, message: "链接解密失败" });
    sourceUrl = decryptedUrl;
  }

  if (!sourceUrl) throw createError({ statusCode: 400, message: "链接为空" });

  // 2. ⚡ 高性能白名单清洗：非网盘链接直接断开，绝不往下走
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(hostname)) {
      return { url: sourceUrl };
    }
  } catch {
    return { url: sourceUrl };
  }

  const cacheKey = `source:${sourceUrl}`;

  // 3. 🚀 一级防御：读取大并发下的分布式 Redis 缓存
  const cached = await getRedisCache<{ url: string }>(cacheKey);
  if (cached?.url) {
    return cached;
  }

  // 4. 🔒 二级防御：并发互斥单飞锁（防止击穿网盘 SDK 和账号限制）
  if (inflightRequests.has(cacheKey)) {
    // 如果当前已经有一个请求正在为这个链接办理“转存”，后续并发请求在此排队等待它的 Promise 结果
    return inflightRequests.get(cacheKey)!;
  }

  // 构建核心转存处理链条
  const transferPromise = (async () => {
    const { type, fid, passcode, url: sharePageUrl } = parseShareUrl(sourceUrl);

    if (type === "unknown" || !fid) {
      return { url: sourceUrl };
    }

    let shareUrl: string;
    let _fid: string;

    try {
      if (type === "quark" || type === "uc") {
        const data = await transferQuarkUC(type, fid, passcode);
        shareUrl = data.shareUrl;
        _fid = JSON.stringify(data.fids);
      } else if (type === "baidu") {
        const data = await transferBaidu(sharePageUrl);
        shareUrl = data.shareUrl;
        _fid = JSON.stringify(data.fids);
      } else if (type === "xunlei") {
        const data = await transferXunlei(fid, passcode);
        shareUrl = data.shareUrl;
        _fid = JSON.stringify(data.fids);
      } else {
        throw createError({ statusCode: 501, message: "未实现的网盘" });
      }
    } catch (e: any) {
      // 降级与差错处理：失效计数
      if (e.statusCode === 404 && id) {
        // 使用非阻塞的异步处理，不卡死当前的请求响应时间
        prisma.source
          .update({
            where: { id },
            data: { invalidNum: { increment: 1 } },
          })
          .catch(() => {});
      }
      throw createError({
        statusCode: e.statusCode || 500,
        message: `获取网盘链接失败: ${e.message || "未知错误"}`,
      });
    }

    // 5. 异步落库：将创建转存记录改为后台执行，不让数据库 I/O 拖慢响应速度
    prisma.source
      .create({
        data: {
          title: sourceTitle,
          url: shareUrl,
          fid: _fid,
          isTemp: true,
        },
      })
      .catch((err) => console.error("落库失败", err));

    // 6. 成功后写入缓存 (20分钟)
    if (shareUrl) {
      await setRedisCache(cacheKey, { url: shareUrl }, 60 * 20);
    }

    return { url: shareUrl };
  })();

  // 将 Promise 送入全局互斥拦截器
  inflightRequests.set(cacheKey, transferPromise);

  try {
    const result = await transferPromise;
    return result;
  } finally {
    // 🔒 无论成功或失败，办完手续后必须从内存中清除锁，允许下一个周期（20分钟后）的请求重新触发转存
    inflightRequests.delete(cacheKey);
  }
});
