import type { NitroFetchRequest, TypedInternalResponse } from "nitropack";

export interface ScrapeResult {
  source: "kuwo" | "qq" | "netease";
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  /** 原始歌词（部分平台可能有） */
  lyrics?: string;
  playUrl?: string;
}

export interface SearchResult {
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
}

export abstract class MusicScraper {
  protected platform: ScrapeResult["source"];

  constructor(platform: ScrapeResult["source"]) {
    this.platform = platform;
  }

  abstract search(keyword: string): Promise<SearchResult[]>;

  abstract detail(sourceId: string): Promise<ScrapeResult>;

  protected async fetchJson<T>(
    url: string,
    headers?: Record<string, string>,
  ): Promise<TypedInternalResponse<NitroFetchRequest, T, "get">> {
    const res = await $fetch<
      TypedInternalResponse<NitroFetchRequest, T, "get">
    >(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...headers,
      },
    } as any);
    return res;
  }

  protected lrcToTxt(lrcStr: string) {
    if (typeof lrcStr !== "string") return "";

    let txt = lrcStr
      // 1. 移除元标签行 [ti:xxx] [ar:xxx] [al:xxx] 等整行
      .replace(/^\[.*\]$/gm, "")
      // 2. 移除行内所有时间戳 [00:12.34] [01:05.67]
      .replace(/\[\d{2}:\d{2}\.\d{1,3}\]/g, "")
      // 3. 去除每行首尾空白
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      // 4. 合并连续空行，只保留单个换行
      .replace(/\n+/g, "\n")
      // 去除首尾多余换行
      .trim();

    return txt;
  }
}
