import { getAllEnabledAccounts } from "#server/lib/accountCache";
import { getClientByAccount } from "#server/lib/pan-instance";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import "dotenv/config";
import axios from "axios";

const TYPE_LABELS: Record<string, string> = {
  quark: "夸克网盘",
  baidu: "百度网盘",
  uc: "UC网盘",
  xunlei: "迅雷网盘",
};

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
        } else {
          await client.fsApi.listFiles({ parentId: "", limit: 1 });
        }
      } catch (error: any) {
        const label = TYPE_LABELS[account.type] || account.type;
        await sendNotice(`${label}账号失效 (ID: ${account.id})`, error.message);
      }
    });

    await Promise.all(checkTasks);

    return {
      result: {
        success: true,
        message: `检查账号状态完成，共检查 ${accounts.length} 个账号`,
      },
    };
  },
});
