import { prisma } from "#server/lib/prisma";
import { credentialStamp, type VerifiedToken } from "#server/utils/auth";

/** 令牌对应的现任管理员 */
export interface TokenAdmin {
  id: string;
  /** 库里的当前用户名（管理员改名后与令牌里的 sub 可能不同，以库为准） */
  username: string;
}

/**
 * 吊销校验：令牌对应的管理员现在是否仍然有效。
 *
 * 令牌本身是无状态的 HMAC，签名有效期内无法作废。这里用令牌里的管理员 ID 和
 * 密码指纹去库里核对，使以下两种情况立即失效：
 * - 管理员被删除 → 查不到记录
 * - 密码被修改 → 密码指纹对不上，该管理员所有旧令牌一并作废
 *
 * 没有 ID / 指纹的旧版令牌一律视为失效（部署本改动后所有管理员需重新登录一次）。
 *
 * 只查主键并取三个短列，不做缓存：删管理员、改密码后下一次请求就生效，
 * 多实例部署下也没有缓存不一致的窗口。
 *
 * @returns 有效则返回管理员；已吊销返回 null。数据库查询出错时异常原样抛出
 *          （不降级成「有效」，也不伪装成 401 把人踢出去）
 */
export async function resolveTokenAdmin(
  token: VerifiedToken,
): Promise<TokenAdmin | null> {
  if (!token.uid || !token.pv) return null;

  const admin = await prisma.admin.findUnique({
    where: { id: token.uid },
    select: { id: true, username: true, password: true },
  });

  if (!admin) return null;
  if (credentialStamp(admin.password) !== token.pv) return null;

  return { id: admin.id, username: admin.username };
}
