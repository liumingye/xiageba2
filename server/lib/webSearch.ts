import { prisma } from "#server/lib/prisma";
import * as cheerio from "cheerio";
import { getRedisCache, setRedisCache } from "#server/lib/redis";

export interface WebSearchResult {
  title: string;
  url: string;
  image?: string;
  source: string;
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
  const cacheKey = `${config.name}:${keyword}`;

  const cached = await getRedisCache<WebSearchResult[]>(cacheKey);
  if (cached) return cached;

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
    const image = extractImage(item, fieldMap);
    if (title && link) {
      results.push({
        title,
        url: link,
        image,
        source: config.name,
      });
    }
  }

  await setRedisCache(cacheKey, results, 30 * 60);
  return results;
};

const parseSelector = (selector: string) => {
  const trimmed = selector.trim();
  // 支持 .class 格式
  if (trimmed.startsWith(".")) {
    return { tag: "", cls: trimmed.slice(1) };
  }
  const [tag, cls] = trimmed.split("+");
  return { tag: tag?.trim() || "", cls: cls?.trim() || "" };
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
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.text();
};

const searchHtml = async (
  config: any,
  keyword: string,
): Promise<WebSearchResult[]> => {
  const cacheKey = `${config.name}:${keyword}`;

  const cached = await getRedisCache<WebSearchResult[]>(cacheKey);
  if (cached) return cached;

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
      });
    }
  }

  await setRedisCache(cacheKey, results, 30 * 60);
  return results;
};

export const webSearch = async (
  keyword: string,
): Promise<WebSearchResult[]> => {
  const configs = await prisma.apiList.findMany({
    where: { status: 1 },
    orderBy: { weight: "desc" },
  });

  const results: WebSearchResult[] = [];

  for (const config of configs) {
    try {
      const items =
        config.type === "api"
          ? await searchApi(config, keyword)
          : await searchHtml(config, keyword);
      results.push(...items);
    } catch (err: any) {
      console.error(err.message || "搜索失败");
      // 单个线路失败不影响其他线路
    }
  }

  return results;
};
