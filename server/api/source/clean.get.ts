import { prisma } from "#server/lib/prisma";
import { getConfigValues } from "#server/lib/configCache";
import { getStorageType } from "#shared/utils";
import {
  getQuarkClient,
  getUCClient,
  getBaiduClient,
  getXunleiClient,
} from "#server/lib/pan";

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
  const client =
    type === "quark" ? await getQuarkClient() : await getUCClient();

  if (fids.length === 0) return [];

  const _fids = fids.flatMap((item) => JSON.parse(item));

  await client.fsApi.delete(_fids);

  return _fids;
}

async function deleteBaiduResource(fids: string[]): Promise<string[]> {
  const config = await getConfigValues(["baidu_temp_dir"]);
  const tempDir = config.baidu_temp_dir;
  if (!tempDir) {
    throw new Error("未配置 baidu 网盘临时目录");
  }

  const client = await getBaiduClient();

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
  const client = await getXunleiClient();

  const _fids = fids.flatMap((item) => JSON.parse(item));

  await client.fsApi.delete(_fids);

  return _fids;
}
