import { getWechatConfig } from "#server/lib/wechatConfig";

const MP_VERIFY_RE = /^\/MP_verify_[A-Za-z0-9]+\.txt$/;

/**
 * 微信公众号 MP_verify_*.txt 验证文件中间件
 * 直接拦截所有以 /MP_verify_ 开头、.txt 结尾的请求
 * 从配置中读取 verifyFileName / verifyFileContent 返回
 * 比 server/routes/ 下的动态段命名更可靠，避免文件名解析歧义
 */
export default defineEventHandler(async (event) => {
  const path = event.path || "/";
  if (!MP_VERIFY_RE.test(path)) return;

  const fileName = path.slice(1); // 去掉开头的 /
  const cfg = await getWechatConfig();

  if (
    !cfg.verifyFileName ||
    !cfg.verifyFileContent ||
    cfg.verifyFileName !== fileName
  ) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
  setResponseHeader(event, "cache-control", "no-store");
  return cfg.verifyFileContent;
});
