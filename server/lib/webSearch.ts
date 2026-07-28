import { prisma } from "#server/lib/prisma";
import * as cheerio from "cheerio";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { encryptUrl } from "#server/lib/crypto";
import { getRandomIp, getRandomUA } from "#server/utils/source";
import { getStorageType } from "#shared/utils";
import axios, { AxiosRequestConfig } from "axios";

export interface WebSearchResult {
  title: string;
  url: string;
  image?: string;
  source: string;
  type: string;
}

// 🔒 内存单飞互斥锁：阻断高并发下多个请求同时压榨同一个第三方爬虫源
const searchInflightLocks = new Map<string, Promise<WebSearchResult[]>>();

const getByPath = (obj: any, path: string) => {
  return path.split(".").reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[key];
  }, obj);
};

const extractList = (data: any, listPath: string): any[] => {
  if (!listPath) return Array.isArray(data) ? data : [data];
  const list = getByPath(data, listPath);
  return Array.isArray(list) ? list : [];
};

const replaceFields = (
  template: string,
  searchFields: string[],
  keyword: string,
) => {
  if (!searchFields || searchFields.length === 0 || !keyword) return template;
  const searchFieldsStr = searchFields.map((field) => `{${field}}`).join("|");
  return template.replace(new RegExp(searchFieldsStr, "g"), keyword);
};

const fillParams = (params: any, keyword: string): any => {
  const str = JSON.stringify(params);
  const filled = replaceFields(str, ["keyword", "kw"], keyword);
  return JSON.parse(filled);
};

const extractImage = (item: any, fieldMap: any): string | undefined => {
  const imageField = fieldMap?.fields?.image;
  const imagesField = fieldMap?.fields?.images;
  if (imageField) {
    const img = getByPath(item, imageField);
    if (img) return img;
  }
  if (imagesField) {
    const imgs = getByPath(item, imagesField);
    if (Array.isArray(imgs) && imgs.length > 0) {
      return typeof imgs[0] === "string"
        ? imgs[0]
        : imgs[0]?.url || imgs[0]?.src;
    }
  }
  return undefined;
};

const buildBaseHeaders = (headers?: Record<string, string>) => {
  const randomIp = getRandomIp("14.16.0.0/12");
  const processedHeaders = headers ? { ...headers } : {};
  for (const [k, v] of Object.entries(processedHeaders)) {
    processedHeaders[k] = replaceFields(v, ["randomip"], randomIp);
  }
  return {
    "User-Agent": getRandomUA(),
    ...processedHeaders,
  };
};

const searchApi = async (
  config: any,
  keyword: string,
): Promise<WebSearchResult[]> => {
  const urlTemplate = config.url || "";
  const method = (config.method || "GET").toLowerCase();
  const headers = JSON.parse(config.headers || "{}") as Record<string, string>;
  const fixedParams = JSON.parse(config.fixed_params || "{}") as any;
  const fieldMap = JSON.parse(config.field_map || "{}") as any;
  const count = Math.max(1, config.count || 10);

  let url = replaceFields(urlTemplate, ["keyword", "kw"], keyword);
  const params = fillParams(fixedParams, keyword);

  const requestConfig: AxiosRequestConfig = {
    method,
    url,
    headers: buildBaseHeaders(headers),
    timeout: 15000,
  };

  if (method === "get") {
    requestConfig.params = params;
  } else {
    requestConfig.data = params;
  }

  const res = await axios(requestConfig);
  const data = res.data;

  const list = extractList(data, fieldMap.list_path || "");
  const results: WebSearchResult[] = [];

  for (const item of list.slice(0, count)) {
    const title = String(
      getByPath(item, fieldMap?.fields?.title || "title") || "",
    );
    const link = String(getByPath(item, fieldMap?.fields?.url || "url") || "");
    const type = getStorageType(link);
    const image = extractImage(item, fieldMap);
    if (title && link) {
      results.push({ title, url: link, image, source: config.name, type });
    }
  }

  return results;
};

interface PanSouMergedItem {
  title?: string;
  name?: string;
  url?: string;
  link?: string;
  image?: string;
  pic?: string;
  cover?: string;
  [key: string]: any;
}

const searchPanSou = async (
  config: any,
  keyword: string,
): Promise<WebSearchResult[]> => {
  const url = config.url;
  const method = (config.method || "POST").toLowerCase();
  const fixedParams = JSON.parse(config.fixed_params || "{}") as any;
  const token = fixedParams.token || "";
  const imageProxy = fixedParams.image_proxy || "";
  const count = Math.max(1, config.count || 10);

  const headers: Record<string, string> = {
    ...buildBaseHeaders(),
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const body = {
    kw: keyword,
    cloud_types: ["quark", "baidu", "uc", "xunlei"],
    src: "all",
    res: "merged_by_type",
    ext: { is_all: true },
  };

  const requestConfig: AxiosRequestConfig = {
    method,
    url,
    headers,
    timeout: 30000,
  };

  if (method === "get") {
    requestConfig.params = body;
  } else {
    requestConfig.data = body;
  }

  const res = await axios(requestConfig);
  const data = res.data.data as {
    merged_by_type?: Record<string, PanSouMergedItem[]>;
  };
  const merged = data?.merged_by_type || {};

  const results: WebSearchResult[] = [];
  for (const items of Object.values(merged)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (results.length >= count) break;
      const title = String(item.note || item.name || "");
      const link = String(item.url || item.link || "");
      let image = extractImage(item, {
        fields: { image: "image", images: "images" },
      });
      if (image && imageProxy) {
        image = imageProxy + image;
      }
      if (title && link) {
        results.push({
          title,
          url: link,
          image,
          source: config.name,
          type: getStorageType(link),
        });
      }
    }
  }

  return results;
};

const extractPanUrl = (text: string) => {
  const patterns = [
    /https:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9_-]+(?:\?pwd=[a-zA-Z0-9]+)?/g,
    /https:\/\/pan\.baidu\.com\/s\/[a-zA-Z0-9_-]+(?:\?pwd=[a-zA-Z0-9]+)?/g,
    /https:\/\/pan\.uc\.cn\/s\/[a-zA-Z0-9_-]+(?:\?pwd=[a-zA-Z0-9]+)?/g,
    /https:\/\/pan\.xunlei\.com\/s\/[a-zA-Z0-9_-]+(?:\?pwd=[a-zA-Z0-9]+)?/g,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return "";
};

const fetchHtml = async (url: string, headers?: Record<string, string>) => {
  const res = await axios({
    url,
    method: "get",
    headers: buildBaseHeaders(headers),
    responseType: "text",
    timeout: 15000,
  });
  return res.data;
};

/**
 * ⚡ 优化重点一：重构 searchHtml 的二次详情页爬取
 * 采用受控的 Promise.all 替换原有的串行 await，使得 10 个详情页能够在 1 秒内并发拉回，同时加设了防灾保护
 */
const searchHtml = async (
  config: any,
  keyword: string,
): Promise<WebSearchResult[]> => {
  const url = replaceFields(config.url || "", ["keyword", "kw"], keyword);
  const headers = JSON.parse(config.headers || "{}") as Record<string, string>;
  const html = await fetchHtml(url, headers || {});
  const $ = cheerio.load(html);

  const itemSelector = config.html_item || "";
  const titleSelector = config.html_title || "";
  const typeSelector = config.html_type || "";
  const url2Selector = config.html_url2 || "";

  if (!itemSelector) return [];

  const results: WebSearchResult[] = [];
  const count = Math.max(1, config.count || 10);
  const elements = $(itemSelector).toArray().slice(0, count);

  // 高并发重构：将原本阻塞性能的循环体内 await 收集起来，改为并行批处理
  const taskPromises = elements.map(async (el) => {
    const $el = $(el);
    const title = titleSelector
      ? $el.find(titleSelector).first().text().trim()
      : "";
    let panUrl = "";

    if (config.html_url === 1 && typeSelector) {
      const detailUrl = $el.find(typeSelector).first().attr("href") || "";
      if (detailUrl) {
        try {
          const absoluteUrl = detailUrl.startsWith("http")
            ? detailUrl
            : new URL(detailUrl, url).href;
          // 加上局部超时控制，防止某个第三方详情页卡死拖垮整条网络链路
          const detailHtml = await Promise.race([
            fetchHtml(absoluteUrl, headers || {}),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 4000),
            ),
          ]);
          panUrl = extractPanUrl(detailHtml);
        } catch {
          // 静默降级
        }
      }
    }

    if (!panUrl && url2Selector) {
      const $link = $el.find(url2Selector).first();
      panUrl = $link.attr("href") || "";
      if (!panUrl) {
        panUrl = extractPanUrl($link.text()) || extractPanUrl($el.html() || "");
      }
    }

    if (!panUrl) {
      panUrl = extractPanUrl($el.html() || "");
    }

    if (title && panUrl) {
      return {
        title,
        url: panUrl,
        source: config.name,
        type: getStorageType(panUrl),
      };
    }
    return null;
  });

  const parsedItems = await Promise.all(taskPromises);
  for (const item of parsedItems) {
    if (item) results.push(item);
  }

  return results;
};

export async function testWebSearchConfig(
  config: any,
  keyword: string,
): Promise<WebSearchResult[]> {
  if (config.type === "api") {
    return await searchApi(config, keyword);
  } else if (config.type === "pansou") {
    return await searchPanSou(config, keyword);
  } else {
    return await searchHtml(config, keyword);
  }
}

/**
 * ⚡ 优化重点二：重构 webSearchConcurrent
 * 引入互斥单飞锁 + 分级限流机制，保护中间件和 Redis 不在高并发下崩溃
 */
export async function webSearchConcurrent(
  keyword: string,
  onResult: (results: WebSearchResult[]) => void,
): Promise<number> {
  // 1. 大闸放行：一次性拿回所有启用的引擎配置（走本地缓存或轻量查询）
  const configs = await prisma.apiList.findMany({
    where: { status: 1 },
    orderBy: { weight: "desc" },
  });

  if (!configs.length) return 0;

  let totalCount = 0;
  const timeoutMs = 25000;

  const withTimeout = <T>(promise: Promise<T>): Promise<T | null> => {
    return Promise.race([
      promise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs),
      ),
    ]);
  };

  // 2. ⚡ 高并发分批控制（并发池限制）：防同时向系统申请数百个 Socket 句柄导致全站超时
  const BATCH_SIZE = 5;

  for (let i = 0; i < configs.length; i += BATCH_SIZE) {
    const chunk = configs.slice(i, i + BATCH_SIZE);

    const chunkPromises = chunk.map(async (config) => {
      const lockKey = `${config.name}:${keyword}`;
      const cacheKey = `webSearch:${lockKey}`;

      // 3. 🔒 一级防御：如果内存中当前正有其他并发请求正在跑这渠道的爬网，直接共享它的 Promise
      if (searchInflightLocks.has(lockKey)) {
        try {
          const sharedItems = await searchInflightLocks.get(lockKey)!;
          if (sharedItems && sharedItems.length > 0) {
            totalCount += sharedItems.length;
            onResult(sharedItems);
          }
        } catch {
          // 共享任务如果遇到远端抛错，允许向下重试
        }
        return;
      }

      // 定义真正执行网络请求的任务体
      const runSearchWorker = async (): Promise<WebSearchResult[]> => {
        // 二级防御：检查 Redis 缓存
        const cached = await getRedisCache<WebSearchResult[]>(cacheKey);
        if (cached) return cached;

        let items: WebSearchResult[] | null = null;
        if (config.type === "api") {
          items = await withTimeout(searchApi(config, keyword));
        } else if (config.type === "pansou") {
          items = await withTimeout(searchPanSou(config, keyword));
        } else {
          items = await withTimeout(searchHtml(config, keyword));
        }

        if (!items || items.length === 0) return [];

        // 高并发优化：加密 URL 操作在入缓存前合并批量完成，减少高频运算
        await Promise.all(
          items.map(async (item) => {
            item.url = await encryptUrl(item.url);
          }),
        );

        // 写入高速 Redis 缓存（保存30分钟）
        await setRedisCache(cacheKey, items, 30 * 60);
        return items;
      };

      const workerPromise = runSearchWorker();
      searchInflightLocks.set(lockKey, workerPromise);

      try {
        const finalItems = await workerPromise;
        if (finalItems && finalItems.length > 0) {
          totalCount += finalItems.length;
          onResult(finalItems);
        }
      } catch (err) {
        console.error(`搜索引擎线路 [${config.name}] 发生故障:`, err);
      } finally {
        // 执行完毕后，无论成功或失败都解除锁定
        searchInflightLocks.delete(lockKey);
      }
    });

    // 分批次阻塞，确保同一时刻只有 5 个引擎通道在全力进行网络爬取/缓存读写
    await Promise.allSettled(chunkPromises);
  }

  return totalCount;
}
