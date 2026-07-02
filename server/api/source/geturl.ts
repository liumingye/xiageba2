import { prisma } from "#server/lib/prisma";
import { getConfigValues } from "#server/lib/configCache";
import { QuarkUCClient, QuarkUCShareApi } from "@netdisk-sdk/quarkuc-sdk";

type NetdiskType = "quark" | "uc" | "baidu" | "xunlei" | "unknown";

interface ParsedShare {
  type: NetdiskType;
  fid: string;
  passcode: string;
}

/**
 * 解析分享链接，识别网盘类型并提取 fid 和提取码
 */
function parseShareUrl(url: string): ParsedShare {
  const extractPwd = (u: string) => {
    const m = u.match(/[?&]pwd=([^&#]+)/);
    return m ? m[1] : "";
  };

  // 夸克: https://pan.quark.cn/s/xxxx?pwd=yyyy
  let match = url.match(/pan\.quark\.cn\/s\/([^/?#]+)/);
  if (match) return { type: "quark", fid: match[1], passcode: extractPwd(url) };

  // UC: https://drive.uc.cn/s/xxxx?pwd=yyyy
  match = url.match(/drive\.uc\.cn\/s\/([^/?#]+)/);
  if (match) return { type: "uc", fid: match[1], passcode: extractPwd(url) };

  // 百度: https://pan.baidu.com/s/xxxx?pwd=yyyy
  match = url.match(/pan\.baidu\.com\/s\/([^/?#]+)/);
  if (match) return { type: "baidu", fid: match[1], passcode: extractPwd(url) };

  return { type: "unknown", fid: "", passcode: "" };
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
 * 夸克网盘转存：获取分享token → 获取文件列表 → 转存到临时目录 → 获取下载链接
 */
async function transferQuark(pwdId: string, passcode: string): Promise<string> {
  const config = await getConfigValues(["quark_cookie", "quark_temp_dir"]);
  const cookie = config.quark_cookie;
  const tempDirId = config.quark_temp_dir || "";

  if (!cookie) {
    throw createError({
      statusCode: 500,
      message: "未配置夸克网盘 Cookie，请先在账号管理中配置",
    });
  }

  const client = new QuarkUCClient({ type: "quark", cookie });
  const shareApi = new QuarkUCShareApi(client);

  // 步骤1: 获取stoken
  const token = await shareApi.token(pwdId, passcode);

  // 步骤2: 获取分享详情
  const detail = await shareApi.detail(pwdId, token.stoken);
  if (!detail.list || detail.list.length === 0) {
    throw createError({ statusCode: 400, message: "分享内容为空" });
  }

  // 步骤3: 转存分享
  const saveResult = await shareApi.save(
    pwdId,
    token.stoken,
    tempDirId,
    detail.list,
  );

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

  // 步骤6: 等待分享完成
  const share_task_data = await shareApi.saveTask(shareResult.task_id, true);

  // 步骤7: 获取分享密码
  const password_data = await shareApi.sharePassword(share_task_data.share_id);

  return password_data.share_url;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const id = query.id as string;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少参数 id" });
  }

  // 查询资源记录
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) {
    throw createError({ statusCode: 404, message: "资源不存在" });
  }

  const { type, fid, passcode } = parseShareUrl(source.url);

  if (type === "unknown") {
    throw createError({ statusCode: 400, message: "无法识别的网盘类型" });
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
  let downloadUrl: string;
  try {
    if (type === "quark") {
      downloadUrl = await transferQuark(fid, passcode);
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
      message: `转存失败: ${e.message || "未知错误"}`,
    });
  }

  // 保存转存记录，下次直接返回
  await prisma.source.create({
    data: {
      cid: source.cid,
      title: source.title,
      url: downloadUrl,
      fid,
      isTemp: true,
    },
  });

  return { url: downloadUrl };
});
