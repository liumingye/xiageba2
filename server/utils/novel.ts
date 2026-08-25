import { getRandomAccountByType } from "#server/lib/accountCache";

/**
 * 随机获取一个启用的百度网盘 Cookie。
 * 优先从 PanAccount 多账号池（type=baidu，status=1）随机选取；
 */
export async function getRandomBaiduCookie(): Promise<string> {
  const account = await getRandomAccountByType("baidu");
  if (account && account.cookie) {
    return account.cookie;
  }
  throw createError({
    statusCode: 500,
    message: "未配置百度网盘 Cookie，请先在账号管理中配置",
  });
}
