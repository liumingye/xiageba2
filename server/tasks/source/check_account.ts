import { getAllEnabledAccounts } from "#server/lib/accountCache";
import { getClientByAccount } from "#server/lib/pan-instance";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { GuangyaClient } from "@netdisk-sdk/guangya-sdk";
import { C139Client } from "@netdisk-sdk/c139-sdk";
import "dotenv/config";
import axios from "axios";
import { acquireLock } from "#server/lib/lock";

const TYPE_LABELS: Record<string, string> = {
  quark: "夸克网盘",
  baidu: "百度网盘",
  uc: "UC网盘",
  xunlei: "迅雷云盘",
  guangya: "光鸭云盘",
  c139: "中国移动云盘",
};

const LOCK_KEY = "lock:cron:check-accounts";
/** 任务每 5 分钟触发，TTL 240s（< 周期），持有期间自动续期 */
const LOCK_TTL = 240;

export default defineTask({
  meta: {
    name: "source:check_account",
    description: "检查账号状态，失效后发送通知",
  },
  async run(): Promise<{
    result: {
      success: boolean;
      message: string;
    };
  }> {
    if (!process.env.MEOW_API) {
      return {
        result: {
          success: false,
          message: "MEOW_API 环境变量未配置",
        },
      };
    }

    // 🔒 分布式锁：多实例部署时只有一个实例执行，避免同一账号被重复检查、重复推送通知。
    // 与 clean_temp 的策略不同：Redis 不可用时这里选择「照常执行」——
    // 漏掉账号失效告警的代价（资源持续不可用且无人知晓）大于重复告警。
    const lockRes = await acquireLock(LOCK_KEY, { ttlSeconds: LOCK_TTL });
    if (!lockRes.acquired) {
      if (lockRes.reason === "locked") {
        return {
          result: {
            success: false,
            message: "已有相同的账号检查任务在后台运行中，本次触发跳过。",
          },
        };
      }
      console.warn(
        "[check_account] Redis 不可用，无法协调多实例，本次将退化为每实例各执行一次",
      );
    }

    try {
      const sendNotice = async (title: string, content: string) => {
        try {
          const api = process.env.MEOW_API!;
          const targetUrl = api
            .replace("{title}", encodeURIComponent(title))
            .replace("{content}", encodeURIComponent(content));

          await axios.get(targetUrl, { timeout: 10000 });
        } catch (err) {
          console.error("发送失效通知失败:", err);
        }
      };

      const accounts = await getAllEnabledAccounts();

      if (accounts.length === 0) {
        return {
          result: {
            success: true,
            message: "没有启用的网盘账号",
          },
        };
      }

      const checkTasks = accounts.map(async (account) => {
        try {
          const client = await getClientByAccount(account);
          const label = TYPE_LABELS[account.type] || account.type;

          if (client instanceof QuarkUCClient) {
            await client.fsApi.sort({ pdir_fid: "0", _size: 1 });
          } else if (client instanceof BaiduClient) {
            await client.fsApi.list({ dir: "/", num: 1 });
            await client.fsOpenApi.listall({ path: "/", start: 0, limit: 1 });
          } else if (client instanceof GuangyaClient) {
            await client.fsApi.listFiles({
              parentId: "",
              page: 0,
              pageSize: 1,
            });
          } else if (client instanceof C139Client) {
            await client.fsApi.listFiles({ parentFileId: "/", pageSize: 1 });
          } else {
            await client.fsApi.listFiles({ parentId: "", limit: 1 });
          }
        } catch (error: any) {
          const label = TYPE_LABELS[account.type] || account.type;
          await sendNotice(
            `${label}账号失效 (ID: ${account.id})`,
            error.message,
          );
        }
      });

      await Promise.all(checkTasks);

      return {
        result: {
          success: true,
          message: `检查账号状态完成，共检查 ${accounts.length} 个账号`,
        },
      };
    } finally {
      // 只释放自己持有的锁；未抢到锁（Redis 不可用降级执行）时无需释放
      if (lockRes.acquired) {
        await lockRes.lock.release();
      }
    }
  },
});
