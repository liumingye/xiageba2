import { getWechatConfig, saveWechatConfig } from "#server/lib/wechatConfig";
import { readMultipartFormData } from "h3";

/**
 * 上传微信公众号验证 TXT 文件
 * POST /api/admin/config/wechat-verify-file
 * form-data: file=<*.txt>
 */
export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    throw createError({ statusCode: 405, message: "不支持的请求方法" });
  }

  const parts = await readMultipartFormData(event);
  const file = parts?.find((p) => p.name === "file");
  if (!file?.data || !file?.filename) {
    throw createError({
      statusCode: 400,
      message: "请上传 TXT 文件",
    });
  }

  const originalName = String(file.filename);
  // 严格限制格式：只允许 MP_verify_*.txt
  if (
    !/^MP_verify_[A-Za-z0-9]+\.txt$/.test(originalName) &&
    !/^[A-Za-z0-9_\-\.]+\.txt$/.test(originalName)
  ) {
    throw createError({
      statusCode: 400,
      message: "文件名格式错误",
    });
  }

  const content = Buffer.from(file.data).toString("utf-8").trim();
  if (!content) {
    throw createError({
      statusCode: 400,
      message: "文件内容为空",
    });
  }

  const old = await getWechatConfig();
  const next = {
    ...old,
    verifyFileName: originalName,
    verifyFileContent: content,
  };
  await saveWechatConfig(next);

  return {
    success: true,
    file_name: originalName,
    access_url: `/${originalName}`,
  };
});
