import {
  getQuarkClient,
  getUCClient,
  getBaiduClient,
  getXunleiClient,
} from "#server/lib/pan-instance";
import "dotenv/config";
import axios from "axios";

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

    // 定义单个网盘的检查逻辑
    const checkTasks = [
      async () => {
        try {
          const client = await getQuarkClient();
          await client.fsApi.sort({ pdir_fid: "0" });
        } catch (error: any) {
          await sendNotice("夸克网盘账号失效", error.message);
        }
      },
      async () => {
        try {
          const client = await getBaiduClient();
          await client.fsApi.list({ dir: "/" });
          await client.fsOpenApi.listall({ path: "/", start: 0 });
        } catch (error: any) {
          await sendNotice("百度网盘账号失效", error.message);
        }
      },
      async () => {
        try {
          const client = await getUCClient();
          await client.fsApi.sort({ pdir_fid: "0" });
        } catch (error: any) {
          await sendNotice("UC网盘账号失效", error.message);
        }
      },
      async () => {
        try {
          const client = await getXunleiClient();
          await client.fsApi.listFiles({ parentId: "" });
        } catch (error: any) {
          await sendNotice("迅雷网盘账号失效", error.message);
        }
      },
    ];

    // 并行执行所有任务
    await Promise.all(checkTasks.map((task) => task()));

    return {
      result: {
        success: true,
        message: "检查账号状态完成",
      },
    };
  },
});
