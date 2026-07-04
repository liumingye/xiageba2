import { prisma } from "#server/lib/prisma";
import { getConfigValues } from "#server/lib/configCache";
import { getStorageType } from "#server/utils/source";
import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";

const THIRTY_MINUTES = 30 * 60 * 1000;

export default defineEventHandler(async (event) => {
  const cutoff = new Date(Date.now() - THIRTY_MINUTES);

  const sources = await prisma.source.findMany({
    where: {
      isTemp: true,
      createdAt: { lt: cutoff },
    },
    select: { id: true, url: true, fid: true },
  });

  const results = {
    total: sources.length,
    errors: [] as string[],
  };

  let fidsQuark: string[] = [];
  let fidsUc: string[] = [];
  let fidsBaidu: string[] = [];
  let fidsXunlei: string[] = [];

  for (const source of sources) {
    const type = getStorageType(source.url);
    if (!source.fid) {
      continue;
    }
    if (type === "quark") {
      fidsQuark.push(source.fid);
    } else if (type === "uc") {
      fidsUc.push(source.fid);
    } else if (type === "baidu") {
      fidsBaidu.push(source.fid);
    } else if (type === "xunlei") {
      fidsXunlei.push(source.fid);
    }
  }

  let fids: string[] = [];
  try {
    if (fidsQuark.length > 0) {
      await deleteQuarkUCResource("quark", fidsQuark);
    }
    if (fidsUc.length > 0) {
      await deleteQuarkUCResource("uc", fidsUc);
    }
    if (fidsBaidu.length > 0) {
      await deleteBaiduResource(fidsBaidu);
    }
    if (fidsXunlei.length > 0) {
      await deleteXunleiResource(fidsXunlei);
    }
  } catch (e: any) {
    results.errors.push(`${e.message || "删除网盘资源失败"}`);
  }

  await prisma.source.deleteMany({
    where: { id: { in: sources.map((v) => v.id) } },
  });

  return { success: true, results, fids };
});

async function deleteQuarkUCResource(
  type: "quark" | "uc",
  fids: string[],
): Promise<string[]> {
  const config = await getConfigValues([`${type}_cookie`]);
  const cookie = config[`${type}_cookie`];
  if (!cookie) {
    throw new Error(`未配置 ${type} 网盘 Cookie`);
  }

  const client = new QuarkUCClient({ type, cookie });

  if (fids.length === 0) return [];

  const _fids = fids.flatMap((item) => JSON.parse(item));

  await client.fsApi.delete(_fids);

  return _fids;
}

async function deleteBaiduResource(fids: string[]): Promise<string[]> {
  const config = await getConfigValues(["baidu_cookie", "baidu_temp_dir"]);
  const cookie = config.baidu_cookie;
  if (!cookie) {
    throw new Error("未配置 baidu 网盘 Cookie");
  }

  const tempDir = config.baidu_temp_dir;

  const client = new BaiduClient(cookie);
  await client.init();

  const _fids = fids
    .flatMap((item) => {
      let paths = JSON.parse(item);
      let newPaths: string[] = [];
      for (let path of paths) {
        // 确保路径以斜杠开头
        if (!path.startsWith("/")) {
          path = `/${path}`;
        }

        // 防止删除根目录
        if (path === "/" || path === tempDir) continue;

        // 替换多个斜杠为单斜杠
        path = path.replace(/\/+/g, "/");
        newPaths.push(path);
      }

      return newPaths;
    })
    .filter(Boolean);

  if (_fids.length === 0) return [];

  await client.fsApi.filemanager("delete", {
    filelist: _fids,
  } as any);

  return _fids;
}

async function deleteXunleiResource(fids: string[]): Promise<string[]> {
  const config = await getConfigValues([
    "xunlei_refresh_token",
    "xunlei_temp_dir",
  ]);
  const refreshToken = config.xunlei_refresh_token;
  if (!refreshToken) {
    throw new Error("未配置 xunlei 网盘 Refresh Token");
  }

  const client = new XunleiClient({ refreshToken });

  const _fids = fids.flatMap((item) => JSON.parse(item));

  await client.fsApi.delete(_fids);

  return _fids;
}
