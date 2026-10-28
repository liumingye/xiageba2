import { automaton_ad_filter } from "#server/lib/simpleAC";
import { getConfigValue } from "#server/lib/configCache";
import type { PanFile } from "./types";

/**
 * 转存后的广告文件清理。
 *
 * 重构前：每个网盘的 transfer 函数末尾都复制了同一段
 * 「读配置 → 判断 enabled → event.waitUntil(deleteAdFiles(...))」，
 * 而 deleteAdFiles / findAdFilesRecursive 内部又各自复制了一份「按 sdkType 选 listFn」
 * 的 if-else。这里把「调度」和「递归找广告文件」的骨架统一，网盘差异只通过
 * listChildren / remove 两个回调注入。
 */

/** 递归查找广告文件时下探的最大层数 */
const AD_SCAN_DEPTH = 2;

export interface AdFilterConfig {
  enabled: boolean;
  keywords: string;
}

const DEFAULT_AD_FILTER: AdFilterConfig = { enabled: false, keywords: "" };

export async function getAdFilterConfig(): Promise<AdFilterConfig> {
  const value = await getConfigValue("ad_filter");
  if (!value) return { ...DEFAULT_AD_FILTER };
  try {
    return { ...DEFAULT_AD_FILTER, ...JSON.parse(value) };
  } catch {
    return { ...DEFAULT_AD_FILTER };
  }
}

/**
 * 按广告关键词过滤文件列表（hasMatch 内部已做小写归一，无需预处理）
 */
export function filterAdFiles(files: PanFile[]): PanFile[] {
  if (!automaton_ad_filter) return files;
  return files.filter((file) => !automaton_ad_filter!.hasMatch(file.name));
}

async function findAdFilesRecursive(
  listChildren: (parentId: string, isTop: boolean) => Promise<PanFile[]>,
  parentId: string,
  maxDepth: number,
  currentDepth: number,
): Promise<string[]> {
  if (!automaton_ad_filter) return [];

  const result: string[] = [];
  const files = await listChildren(parentId, false);

  for (const file of files) {
    if (automaton_ad_filter.hasMatch(file.name)) {
      result.push(file.id);
      continue;
    }

    if (file.isDir && currentDepth < maxDepth) {
      result.push(
        ...(await findAdFilesRecursive(
          listChildren,
          file.id,
          maxDepth,
          currentDepth + 1,
        )),
      );
    }
  }

  return result;
}

export interface AdCleanupTarget {
  /** 转存后得到的顶层文件/目录 id */
  topFids: string[];
  /** 列出子项；isTop 语义同原实现（顶层目录可能不是目录，需要额外探测） */
  listChildren: (parentId: string, isTop: boolean) => Promise<PanFile[]>;
  /** 删除一批 id，各网盘删除接口签名不同，由调用方适配 */
  remove: (ids: string[]) => Promise<unknown>;
}

/**
 * 找到并删除目标目录下的广告文件（顶层 + 递归两层）
 */
export async function deleteAdFiles(
  target: AdCleanupTarget,
): Promise<void> {
  if (!automaton_ad_filter) return;

  const { topFids, listChildren, remove } = target;
  const adFids: string[] = [];

  for (const fid of topFids) {
    try {
      const files = await listChildren(fid, true);

      for (const file of files) {
        if (automaton_ad_filter.hasMatch(file.name)) {
          adFids.push(file.id);
          continue;
        }

        if (file.isDir) {
          adFids.push(
            ...(await findAdFilesRecursive(
              listChildren,
              file.id,
              AD_SCAN_DEPTH,
              1,
            )),
          );
        }
      }
    } catch (e) {
      console.error("检查广告文件失败", fid, e);
    }
  }

  if (adFids.length === 0) return;

  try {
    await remove(adFids);
    console.log(`已删除 ${adFids.length} 个广告文件/目录`);
  } catch (e) {
    console.error("删除广告文件失败", e);
  }
}

/**
 * 只需要事件对象能登记后台任务即可，不依赖 h3（server/lib 保持与框架无关）
 */
export interface BackgroundScheduler {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * 按配置决定是否在后台清理广告文件。配置关闭或无目标时直接跳过，不占用 waitUntil。
 */
export async function scheduleAdCleanup(
  event: BackgroundScheduler,
  target: AdCleanupTarget,
): Promise<void> {
  if (target.topFids.length === 0) return;

  const config = await getAdFilterConfig();
  if (!config.enabled) return;

  event.waitUntil(
    deleteAdFiles(target).catch((e) =>
      console.error("异步删除广告文件失败", e),
    ),
  );
}
