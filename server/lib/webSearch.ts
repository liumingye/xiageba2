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
  if (!searchFields || searchFields.length === 0) return template;
  if (!keyword) return template;
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
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      headers[k] = replaceFields(v, ["randomip"], randomIp);
    }
  }
  return {
    "User-Agent": getRandomUA(),
    ...headers,
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
      results.push({
        title,
        url: link,
        image,
        source: config.name,
        type,
      });
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
        fields: {
          image: "image",
          images: "images",
        },
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

  for (const el of $(itemSelector).toArray()) {
    if (results.length >= count) break;
    const $el = $(el);

    const title = titleSelector
      ? $el.find(titleSelector).first().text().trim()
      : "";

    let panUrl = "";

    if (config.html_url === 1 && typeSelector) {
      const detailUrl = $el.find(typeSelector).first().attr("href") || "";
      if (detailUrl) {
        try {
          const detailHtml = await fetchHtml(
            detailUrl.startsWith("http")
              ? detailUrl
              : new URL(detailUrl, url).href,
            headers || {},
          );
          panUrl = extractPanUrl(detailHtml);
        } catch {
          // 忽略详情页抓取失败
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
      results.push({
        title,
        url: panUrl,
        source: config.name,
        type: getStorageType(panUrl),
      });
    }
  }

  return results;
};

// export async function* webSearch(
//   keyword: string,
// ): AsyncGenerator<WebSearchResult> {
//   const configs = await prisma.apiList.findMany({
//     where: { status: 1 },
//     orderBy: { weight: "desc" },
//   });

//   for (const config of configs) {
//     const cacheKey = `webSearch:${config.name}:${keyword}`;

//     try {
//       const cached = await getRedisCache<WebSearchResult[]>(cacheKey);
//       if (cached) {
//         for (const item of cached) yield item;
//         continue;
//       }

//       let items: WebSearchResult[] = [];
//       if (config.type === "api") {
//         items = await searchApi(config, keyword);
//       } else if (config.type === "pansou") {
//         items = await searchPanSou(config, keyword);
//       } else {
//         items = await searchHtml(config, keyword);
//       }

//       for (const item of items) {
//         item.url = await encryptUrl(item.url);
//       }

//       await setRedisCache(cacheKey, items, 30 * 60);

//       for (const item of items) yield item;
//     } catch (err: any) {
//       console.error(err || "搜索失败");
//       // 单个线路失败不影响其他线路
//     }
//   }
// }

export async function webSearchConcurrent(
  keyword: string,
  onResult: (results: WebSearchResult[]) => void,
): Promise<number> {
  const configs = await prisma.apiList.findMany({
    where: { status: 1 },
    orderBy: { weight: "desc" },
  });

  let totalCount = 0;
  const timeoutMs = 30000; // 单个搜索源超时时间

  const withTimeout = <T>(promise: Promise<T>): Promise<T | null> => {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs),
    );
    return Promise.race([promise, timeout]);
  };

  // 并发执行所有搜索源
  const promises = configs.map(async (config) => {
    const cacheKey = `webSearch:${config.name}:${keyword}`;

    try {
      // 先尝试获取缓存
      const cached = await getRedisCache<WebSearchResult[]>(cacheKey);
      if (cached) {
        totalCount += cached.length;
        onResult(cached); // 立即返回缓存结果
        return;
      }

      // 根据类型执行搜索
      let items: WebSearchResult[] | null = null;
      if (config.type === "api") {
        items = await withTimeout(searchApi(config, keyword));
      } else if (config.type === "pansou") {
        items = await withTimeout(searchPanSou(config, keyword));
      } else {
        items = await withTimeout(searchHtml(config, keyword));
      }

      if (items === null) {
        console.warn(`搜索 ${config.name} 超时`);
        return;
      }

      // 加密 URL
      for (const item of items) {
        item.url = await encryptUrl(item.url);
      }

      // 设置缓存
      await setRedisCache(cacheKey, items, 30 * 60);

      totalCount += items.length;
      onResult(items); // 立即返回搜索结果
    } catch (err: any) {
      console.error(err || `搜索 ${config.name} 失败`);
      // 单个线路失败不影响其他线路
    }
  });

  // 等待所有搜索完成
  await Promise.allSettled(promises);
  return totalCount;
}
