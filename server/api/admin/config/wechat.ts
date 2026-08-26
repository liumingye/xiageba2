import { getWechatConfig, saveWechatConfig } from "#server/lib/wechatConfig";
import type { WechatConfig } from "#server/lib/wechatConfig";
import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const method = event.method;

  // GET：读取配置（AppSecret / EncodingAESKey 返回空字符串占位，
  //   避免敏感字段明文泄露；保存时若原值为空字符串则使用数据库旧值保留）
  if (method === "GET") {
    const cfg = await getWechatConfig();
    return {
      data: {
        ...cfg,
        appSecret: cfg.appSecret ? "********" : "",
        encodingAESKey: cfg.encodingAESKey ? "********" : "",
      },
    };
  }

  // POST：保存配置
  if (method === "POST") {
    const body = await readBody(event);

    // 读取数据库旧值，用于占位符回传时保留真实密钥
    const old = await getWechatConfig();

    const enabled = Boolean(body.enabled);
    const appId = (body.appId || "").toString().trim();
    const token = (body.token || "").toString().trim();
    const welcomeMessage =
      body.welcomeMessage !== undefined
        ? String(body.welcomeMessage)
        : old.welcomeMessage;

    let appSecret = (body.appSecret || "").toString();
    if (!appSecret || appSecret === "********") {
      appSecret = old.appSecret;
    }

    let encodingAESKey = (body.encodingAESKey || "").toString();
    if (!encodingAESKey || encodingAESKey === "********") {
      encodingAESKey = old.encodingAESKey;
    }

    const autoReplyEnabled =
      body.autoReplyEnabled !== undefined
        ? Boolean(body.autoReplyEnabled)
        : old.autoReplyEnabled;

    let searchLimit = Number(body.searchLimit);
    if (!searchLimit || searchLimit < 1 || searchLimit > 100) {
      searchLimit = old.searchLimit || 5;
    }

    // 验证文件保留原数据库值（单独通过上传 API 修改）
    const verifyFileName = old.verifyFileName;
    const verifyFileContent = old.verifyFileContent;

    const data: WechatConfig = {
      enabled,
      appId,
      appSecret,
      token,
      encodingAESKey,
      autoReplyEnabled,
      welcomeMessage,
      searchLimit,
      verifyFileName,
      verifyFileContent,
    };

    await saveWechatConfig(data);

    // 返回脱敏值
    return {
      success: true,
      data: {
        ...data,
        appSecret: data.appSecret ? "********" : "",
        encodingAESKey: data.encodingAESKey ? "********" : "",
      },
    };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
