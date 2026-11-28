/**
 * ADMIN_SECRET 的统一读取入口。
 *
 * 这个密钥同时用于签发后台令牌（auth）和验证码通行令牌（bot-defense）。
 * .env.example 里的占位值是公开的：照抄部署等于任何人都能用它在本地签出合法令牌，
 * 所以占位值必须和「未设置」一样被拒绝，而不是只检查有没有值。
 */

/** .env.example 中的示例值；修改示例文件时必须同步这里 */
const PLACEHOLDER_SECRETS = ["change-me-in-production"];

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * 读取 ADMIN_SECRET；未设置或仍是占位值时抛错（调用方决定是兜底还是向外抛）。
 *
 * @param scope 错误信息前缀，用于区分是哪条链路读到的
 */
export function readAdminSecret(scope: string): string {
  const secret = process.env.ADMIN_SECRET;

  if (!secret?.trim()) {
    throw new Error(
      `[${scope}] ADMIN_SECRET 环境变量未设置，请在 .env 或部署环境中配置`,
    );
  }

  if (PLACEHOLDER_SECRETS.some((item) => normalize(item) === normalize(secret))) {
    throw new Error(
      `[${scope}] ADMIN_SECRET 仍是 .env.example 里的占位值，任何人都能用它伪造令牌；` +
        `请替换为自己的随机密钥（例如执行 openssl rand -base64 48 生成）`,
    );
  }

  return secret;
}
