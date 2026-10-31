import { getEnabledAccountsByType } from "#server/lib/accountCache";
import { getClientByAccount } from "#server/lib/pan-instance";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { acquireLock } from "#server/lib/lock";

const LOCK_KEY = "lock:cron:check-violated";
/** 任务每 5 分钟触发，TTL 240s（< 周期），持有期间自动续期 */
const LOCK_TTL = 240;

/** 每页拉取的违规分享数量 */
const PAGE_SIZE = 500;
/** 每次批量取消的分享数量 */
const DELETE_BATCH_SIZE = 20;

interface ViolatedShareItem {
  share_id?: string;
  title?: string;
  file_name?: string;
}

interface ViolatedPageData {
  list?: ViolatedShareItem[];
  total?: number;
}

/**
 * 拉取单个夸克账号的全部违规分享（分页）
 */
async function fetchAllViolated(client: QuarkUCClient): Promise<ViolatedShareItem[]> {
  const all: ViolatedShareItem[] = [];
  let page = 1;

  while (true) {
    const { body } = await client.agentApi
      .get("/share/mypage/detail")
      .query({
        _page: String(page),
        _size: String(PAGE_SIZE),
        _order_field: "created_at",
        _order_type: "desc",
        _fetch_total: "1",
        _fetch_notify_follow: "1",
        _filter: "violated",
        _share_type: "0,1",
      });

    const data = (body?.data ?? {}) as ViolatedPageData;
    const items = data.list ?? [];

    if (!items.length) break;

    all.push(...items);

    if (items.length < PAGE_SIZE) break;

    page += 1;
  }

  return all;
}

/**
 * 取消分享（分批）
 * 返回 { success, failed } 数量
 */
async function deleteShares(
  client: QuarkUCClient,
  shareIds: string[],
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < shareIds.length; i += DELETE_BATCH_SIZE) {
    const batch = shareIds.slice(i, i + DELETE_BATCH_SIZE);
    try {
      // 接口 code !== 0 时 agentApi 的 .ok(throwError) 会抛 ApiError
      await client.agentApi.post("/share/delete").send({ share_ids: batch });
      success += batch.length;
    } catch (e: any) {
      failed += batch.length;
      console.error(
        `[check_violated] 取消分享失败 (${batch.length} 个): ${e?.message || e}`,
      );
    }
  }

  return { success, failed };
}

export default defineTask({
  meta: {
    name: "source:check_violated",
    description: "查询夸克网盘账号的违规分享并自动取消",
  },
  async run(): Promise<{
    result: {
      success: boolean;
      message: string;
      accounts?: number;
      violated?: number;
      cancelled?: number;
      failed?: number;
    };
  }> {
    // 🔒 分布式锁：多实例部署时只有一个实例执行，避免同一账号重复拉取、重复取消。
    // 策略对齐 check_account：Redis 不可用时降级照常执行——漏清理违规分享的代价大于重复取消。
    const lockRes = await acquireLock(LOCK_KEY, { ttlSeconds: LOCK_TTL });
    if (!lockRes.acquired) {
      if (lockRes.reason === "locked") {
        return {
          result: {
            success: false,
            message: "已有相同的违规分享检查任务在后台运行中，本次触发跳过。",
          },
        };
      }
      console.warn(
        "[check_violated] Redis 不可用，无法协调多实例，本次将退化为每实例各执行一次",
      );
    }

    try {
      const accounts = await getEnabledAccountsByType("quark");

      if (accounts.length === 0) {
        return {
          result: {
            success: true,
            message: "没有启用的夸克网盘账号",
          },
        };
      }

      let totalViolated = 0;
      let totalCancelled = 0;
      let totalFailed = 0;

      for (const account of accounts) {
        let client: QuarkUCClient;
        try {
          const c = await getClientByAccount(account);
          if (!(c instanceof QuarkUCClient)) {
            // quark 类型理论上只会得到 QuarkUCClient，防御性跳过
            continue;
          }
          client = c;
        } catch (e: any) {
          console.error(
            `[check_violated] 账号 ${account.id} 获取客户端失败: ${e?.message || e}`,
          );
          continue;
        }

        let items: ViolatedShareItem[];
        try {
          items = await fetchAllViolated(client);
        } catch (e: any) {
          console.error(
            `[check_violated] 账号 ${account.id} 查询违规分享失败: ${e?.message || e}`,
          );
          continue;
        }

        if (!items.length) continue;

        const shareIds = items
          .map((item) => item.share_id)
          .filter((id): id is string => Boolean(id));

        totalViolated += shareIds.length;

        if (shareIds.length === 0) {
          console.warn(
            `[check_violated] 账号 ${account.id} 检测到 ${items.length} 条违规分享但缺少 share_id，跳过`,
          );
          continue;
        }

        const { success, failed } = await deleteShares(client, shareIds);
        totalCancelled += success;
        totalFailed += failed;

        console.log(
          `[check_violated] 账号 ${account.id} 清理完成 | 成功 ${success} | 失败 ${failed}`,
        );
      }

      return {
        result: {
          success: totalFailed === 0,
          message: `检查完成，共处理 ${accounts.length} 个账号，检测违规分享 ${totalViolated} 条，成功取消 ${totalCancelled} 条，失败 ${totalFailed} 条`,
          accounts: accounts.length,
          violated: totalViolated,
          cancelled: totalCancelled,
          failed: totalFailed,
        },
      };
    } finally {
      if (lockRes.acquired) {
        await lockRes.lock.release();
      }
    }
  },
});
