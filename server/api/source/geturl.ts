import { prisma } from "#server/lib/prisma";
import { getConfigValues } from "#server/lib/configCache";
import { decryptUrl } from "#server/lib/crypto";
import { parseShareParam } from "@netdisk-sdk/baidu-sdk";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import {
  getQuarkClient,
  getUCClient,
  getBaiduClient,
  getXunleiClient,
} from "#server/lib/pan";

type NetdiskType = "quark" | "uc" | "baidu" | "xunlei" | "unknown";

interface ParsedShare {
  type: NetdiskType;
  fid: string;
  passcode: string;
  url: string;
}

/**
 * 解析分享链接，识别网盘类型并提取 fid 和提取码
 */
export function parseShareUrl(url: string): ParsedShare {
  const extractPwd = (u: string) => {
    const m = u.match(/[?&]pwd=([^&#]+)/);
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

  // 步骤2: 获取分享详情
  const detail = await shareApi.detail(pwdId, token.stoken);
  if (!detail.list || detail.list.length === 0) {
    throw createError({ statusCode: 404, message: "分享内容为空" });
  }

  // 步骤3: 转存分享
  const saveResult = await shareApi.save(
    pwdId,
    token.stoken,
    tempDirId,
    detail.list,
  );
  if (!saveResult.task_id) {
    throw createError({ statusCode: 500, message: "转存任务失败" });
  }

  // 步骤4: 等待转存完成
  let taskResult = await shareApi.saveTask(saveResult.task_id, true);
  if (taskResult.status === 0) {
    throw createError({ statusCode: 500, message: "转存任务未完成" });
  }

  // 步骤5: 创建分享
  const shareResult = await shareApi.share(
    taskResult.save_as?.save_as_top_fids || [],
    token.title,
  );
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

  let fids: string[] = [];
  if (result.info) {
    fids = result.info.map((item) => tempDir + item.path);
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
    fileIds: detail.files.map((file) => file.id),
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

  if (id) {
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source) {
      throw createError({ statusCode: 404, message: "资源不存在" });
    }
    sourceTitle = source.title;
    sourceUrl = source.url;
  } else if (inputUrl) {
    const decryptedUrl = await decryptUrl(inputUrl);
    if (decryptedUrl === null) {
      throw createError({ statusCode: 400, message: "链接解密失败" });
    }
    sourceUrl = decryptedUrl;
  }

  if (!sourceUrl) {
    throw createError({ statusCode: 400, message: "链接为空" });
  }

  // hostname 白名单验证，非网盘域名直接返回原链接
  try {
    const hostname = new URL(sourceUrl).hostname;
    const allowedHosts = [
      "pan.quark.cn",
      "pan.baidu.com",
      "drive.uc.cn",
      "pan.xunlei.com",
    ];
    if (!allowedHosts.includes(hostname)) {
      return { url: sourceUrl };
    }
  } catch {
    return { url: sourceUrl };
  }

  const cacheKey = `source:${sourceUrl}`;

  const cached = await getRedisCache<SearchResult[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const { type, fid, passcode, url: sharePageUrl } = parseShareUrl(sourceUrl);

  if (type === "unknown") {
    return { url: sourceUrl };
    // throw createError({ statusCode: 400, message: "无法识别的网盘类型" });
  }
  if (!fid) {
    throw createError({ statusCode: 400, message: "无法从URL中提取文件ID" });
  }

  // 根据网盘类型执行转存
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
      throw createError({
        statusCode: 501,
        message: `${type} 网盘转存暂未实现`,
      });
    }
  } catch (e: any) {
    // 404 表示分享不存在，
    if (e.statusCode === 404 && id) {
      // invalidNum +1
      await prisma.source.update({
        where: { id },
        data: { invalidNum: { increment: 1 } },
      });
    }
    // SDK 抛出的错误转换为友好提示
    throw createError({
      statusCode: e.statusCode || 500,
      message: `获取网盘链接失败: ${e.message || "未知错误"}`,
    });
  }

  // 保存转存记录，用于定期删除
  await prisma.source.create({
    data: {
      title: sourceTitle,
      url: shareUrl,
      fid: _fid,
      isTemp: true,
    },
  });

  if (shareUrl) {
    await setRedisCache(cacheKey, { url: shareUrl }, 60 * 20);
  }

  return { url: shareUrl };
});
