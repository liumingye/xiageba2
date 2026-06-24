import { MusicScraper, type ScrapeResult, type SearchResult } from "../index";
import { eapi, weapi } from "./crypto";
import { parseTools } from "./utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/2.10.2.200154";
const REFERER = "https://music.163.com/";

const HEADERS = {
  "User-Agent": USER_AGENT,
  Referer: REFERER,
  "Content-Type": "application/x-www-form-urlencoded",
  origin: "https://music.163.com",
};

export class NetEaseScraper extends MusicScraper {
  constructor() {
    super("netease");
  }

  async search(keyword: string): Promise<SearchResult[]> {
    try {
      const cleanKeyword = keyword.replace(/[!@#$%^&*/]+/g, "");
      const url = `http://interface.music.163.com/eapi/batch`;

      const data = await $fetch<any>(url, {
        method: "POST",
        headers: HEADERS,
        body: eapi("/api/search/song/list/page", {
          keyword: cleanKeyword,
          needCorrect: 1,
          channel: "typing",
          offset: 0,
          scene: "normal",
          total: true,
          limit: 20,
        }),
      });

      if (data.code === 400 || data?.data?.resources?.length === 0) {
        return [];
      }

      const songs = data.data.resources || [];
      return songs.map((s: any) => ({
        sourceId: s.baseInfo.simpleSongData.id,
        title: s.baseInfo.simpleSongData.name || "",
        artist:
          (s.baseInfo.simpleSongData.ar || [])
            .map((a: any) => a.name)
            .join(" / ") || "",
        album: s.baseInfo.simpleSongData.al.name || "",
        cover: s.baseInfo.simpleSongData.al?.picUrl || "",
      }));
    } catch (e) {
      console.error("[NetEaseScraper] search error:", e);
      return [];
    }
  }

  async detail(sourceId: string): Promise<ScrapeResult> {
    try {
      const url = `https://music.163.com/weapi/v3/song/detail`;

      const data = await $fetch<any>(url, {
        method: "POST",
        headers: HEADERS,
        body: weapi({
          c: `[{"id":${sourceId}}]`,
          ids: `[${sourceId}]`,
        }),
      });

      // console.log(data);
      if (data.code === 400 || data.code === 406) {
        throw new Error("访问过于频繁或接口失效");
      }

      const song = data.songs?.[0] || {};
      const artists = (song.ar || []).map((a: any) => a.name).join(" / ") || "";
      const albumName = song.al?.name || "";
      const albumPic = song.al?.picUrl || "";
      const songName = song.name || "";

      // 获取歌词
      let lyrics = "";
      try {
        lyrics = await this.getLyrics(sourceId);
      } catch {
        // 歌词获取失败不影响主流程
      }

      return {
        source: "netease",
        sourceId,
        title: songName,
        artist: artists,
        album: albumName,
        cover: albumPic,
        lyrics,
      };
    } catch (e) {
      console.error("[NetEaseScraper] detail error:", e);
      return {
        source: "netease",
        sourceId,
        title: "",
        artist: "",
        album: "",
        cover: "",
      };
    }
  }

  private async getLyrics(songId: string): Promise<string> {
    const url = `https://interface3.music.163.com/eapi/song/lyric/v1`;

    const data = await $fetch<any>(url, {
      method: "POST",
      headers: HEADERS,
      body: eapi("/api/song/lyric/v1", {
        id: songId,
        cp: false,
        tv: 0,
        lv: 0,
        rv: 0,
        kv: 0,
        yv: 0,
        ytv: 0,
        yrv: 0,
      }),
    });

    const info = parseTools.parse("", "", "", data.lrc?.lyric, "", "");

    return this.lrcToTxt(info.lyric);
  }

  async getUrl(sourceId: string) {
    return "";
  }
}
