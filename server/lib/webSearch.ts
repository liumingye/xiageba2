import { prisma } from "#server/lib/prisma";
import * as cheerio from "cheerio";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { encryptUrl } from "#server/lib/crypto";
import { getStorageType, getRandomIp, getRandomUA } from "#server/utils/source";

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

const replaceKeyword = (template: string, keyword: string) => {
  return template.replace(/\{keyword\}|\{kw\}/g, keyword);
};

const fillParams = (params: any, keyword: string): any => {
  const str = JSON.stringify(params);
  const filled = replaceKeyword(str, keyword);
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

const searchApi = async (
  config: any,
  keyword: string,
): Promise<WebSearchResult[]> => {
  const urlTemplate = config.url || "";
  const method = (config.method || "GET").toUpperCase();
  const headers = JSON.parse(config.headers || "{}") as Record<string, string>;
  const fixedParams = JSON.parse(config.fixed_params || "{}") as any;
  const fieldMap = JSON.parse(config.field_map || "{}") as any;
  const count = Math.max(1, config.count || 10);

  let url = replaceKeyword(urlTemplate, keyword);
  const params = fillParams(fixedParams, keyword);

  const options: RequestInit = { method, headers };
  if (method === "GET") {
    const urlObj = new URL(url);
    for (const [k, v] of Object.entries(params)) {
      urlObj.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    url = urlObj.toString();
    options.body = undefined;
  } else {
    options.body = JSON.stringify(params);
  }

  const randomIp = getRandomIp("14.16.0.0/12");
  options.headers = {
    "User-Agent": getRandomUA(),
    "CF-Connecting-IP": randomIp,
    "X-Real-IP": randomIp,
    "X-Forwarded-For": randomIp,
    "EO-Connecting-IP": randomIp,
    ...options.headers,
  };

  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`请求失败: ${res.status}`);
  }
  const data = await res.json();

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

const fetchHtml = async (url: string) => {
  const randomIp = getRandomIp("14.16.0.0/12");

  const res = await fetch(url, {
    headers: {
      "User-Agent": getRandomUA(),
      "CF-Connecting-IP": randomIp,
      "X-Real-IP": randomIp,
      "X-Forwarded-For": randomIp,
      "EO-Connecting-IP": randomIp,
    },
  });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.text();
};

const searchHtml = async (
  config: any,
  keyword: string,
): Promise<WebSearchResult[]> => {
  const url = replaceKeyword(config.url || "", keyword);
  const html = await fetchHtml(url);
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

export async function* webSearch(
  keyword: string,
): AsyncGenerator<WebSearchResult> {
  const configs = await prisma.apiList.findMany({
    where: { status: 1 },
    orderBy: { weight: "desc" },
  });

  for (const config of configs) {
    const cacheKey = `webSearch:${config.name}:${keyword}`;

    try {
      const cached = await getRedisCache<WebSearchResult[]>(cacheKey);
      if (cached) {
        for (const item of cached) yield item;
        continue;
      }

      const items =
        config.type === "api"
          ? await searchApi(config, keyword)
          : await searchHtml(config, keyword);

      for (const item of items) {
        item.url = await encryptUrl(item.url);
      }

      await setRedisCache(cacheKey, items, 30 * 60);

      for (const item of items) yield item;
    } catch (err: any) {
      console.error(err.message || "搜索失败");
      // 单个线路失败不影响其他线路
    }
  }
}
