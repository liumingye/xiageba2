import { prisma } from "#server/lib/prisma";
import { getConfigValues } from "#server/lib/configCache";
import { decryptUrl } from "#server/lib/crypto";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient, parseShareParam } from "@netdisk-sdk/baidu-sdk";

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

  return { type: "unknown", fid: "", passcode: "", url };
}

/**
 * 查找或创建夸克网盘临时目录，返回目录 fid
 */
async function findOrCreateQuarkDir(
  client: QuarkUCClient,
  dirName: string,
): Promise<string> {
  const result = await client.fsApi.sort({ pdir_fid: "0", _size: 200 });
  const existing = result.list.find(
    (f) => f.file_name === dirName && f.file_type === 0,
  );
  if (existing) return existing.fid;

  const newDir = await client.fsApi.mkdir(dirName, { pdir_fid: "0" });
  return newDir.fid;
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
  const config = await getConfigValues([`${type}_cookie`, `${type}_temp_dir`]);
  const cookie = config[`${type}_cookie`];
  const tempDirId = config[`${type}_temp_dir`] || "";

  if (!cookie) {
    throw createError({
      statusCode: 500,
      message: `未配置${type === "quark" ? "夸克" : "UC"}网盘 Cookie，请先在账号管理中配置`,
    });
  }

  const client = new QuarkUCClient({ type, cookie });
  const shareApi = client.shareApi;

  // 步骤1: 获取stoken
  const token = await shareApi.token(pwdId, passcode);
  if (!token.stoken) {
    throw createError({ statusCode: 500, message: "获取stoken失败" });
  }

  // 步骤2: 获取分享详情
  const detail = await shareApi.detail(pwdId, token.stoken);
  if (!detail.list || detail.list.length === 0) {
    throw createError({ statusCode: 500, message: "分享内容为空" });
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
  const taskResult = await shareApi.saveTask(saveResult.task_id, true);
  if (taskResult.status !== 2) {
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
  const config = await getConfigValues(["baidu_cookie", "baidu_temp_dir"]);
  const cookie = config.baidu_cookie;
  const tempDir = config.baidu_temp_dir || "/";

  if (!cookie) {
    throw createError({
      statusCode: 500,
      message: "未配置百度网盘 Cookie，请先在账号管理中配置",
    });
  }

  const shareParam = parseShareParam(_shareUrl);
  if (!shareParam) {
    throw createError({ statusCode: 500, message: "无效的百度分享链接" });
  }

  const client = new BaiduClient(cookie);
  await client.init();

  const shareInfo = await client.fsShareApi.wxlist({
    ...shareParam,
    dir: "/",
    page: 1,
    num: 1000,
    root: 1,
  });

  if (!shareInfo.list || shareInfo.list.length === 0) {
    throw createError({ statusCode: 500, message: "分享内容为空" });
  }

  const fsids = shareInfo.list.map((f) => f.fs_id);
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
    fids = result.info.map((item) => tempDir + "/" + item.path);
  }

  return {
    shareUrl,
    fids,
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

  const { type, fid, passcode, url: sharePageUrl } = parseShareUrl(sourceUrl);

  if (type === "unknown") {
    return { url: sourceUrl };
    // throw createError({ statusCode: 400, message: "无法识别的网盘类型" });
  }
  if (!fid) {
    throw createError({ statusCode: 400, message: "无法从URL中提取文件ID" });
  }

  // 检查是否已存在转存记录（isTemp=true 且 fid 匹配）
  const tempRecord = await prisma.source.findFirst({
    where: { fid, isTemp: true },
  });
  if (tempRecord) {
    return { url: tempRecord.url };
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
    } else {
      throw createError({
        statusCode: 501,
        message: `${type} 网盘转存暂未实现`,
      });
    }
  } catch (e: any) {
    // SDK 抛出的错误转换为友好提示
    if (e.statusCode) throw e;
    throw createError({
      statusCode: 500,
      message: `获取网盘链接失败: ${e.message || "未知错误"}`,
    });
  }

  // 保存转存记录，下次直接返回
  await prisma.source.create({
    data: {
      title: sourceTitle,
      url: shareUrl,
      fid: _fid,
      isTemp: true,
    },
  });

  return { url: shareUrl };
});
