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
      if (!process.env.MEOW_API) {
        return {
          result: {
            success: false,
            message: "MEOW_API 环境变量未配置",
          },
        };
      }
      const api = process.env.MEOW_API;
      await axios.get(
        api.replace("{title}", title).replace("{content}", content),
        {
          timeout: 10000,
        },
      );
    };

    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    try {
      const client1 = await getQuarkClient();
      await client1.fsApi.sort({ pdir_fid: "0" });
    } catch (error: any) {
      sendNotice("夸克网盘账号失效", error.message);
    }

    await sleep(5000);

    try {
      const client2 = await getBaiduClient();
      await client2.fsApi.list({ dir: "/" });
      await client2.fsOpenApi.listall({ path: "/", start: 0 });
    } catch (error: any) {
      sendNotice("百度网盘账号失效", error.message);
    }

    await sleep(5000);

    try {
      const client3 = await getUCClient();
      await client3.fsApi.sort({ pdir_fid: "0" });
    } catch (error: any) {
      sendNotice("UC网盘账号失效", error.message);
    }

    await sleep(5000);

    try {
      const client4 = await getXunleiClient();
      await client4.fsApi.listFiles({ parentId: "" });
    } catch (error: any) {
      sendNotice("迅雷网盘账号失效", error.message);
    }

    return {
      result: {
        success: true,
        message: "检查账号状态完成",
      },
    };
  },
});
