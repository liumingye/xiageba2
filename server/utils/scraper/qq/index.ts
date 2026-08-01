import { MusicScraper, type ScrapeResult, type SearchResult } from "../index";
import "dotenv/config";

const MUSICU_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg";

const COMM = {
  _channelid: "0",
  _os_version: "6.2.9200-2",
  authst: "",
  ct: "19",
  cv: "1873",
  patch: "118",
  psrf_access_token_expiresAt: 0,
  psrf_qqaccess_token: "",
  psrf_qqopenid: "",
  psrf_qqunionid: "",
  tmeAppID: "qqmusic",
  tmeLoginType: 2,
  uin: "0",
  wid: "0",
};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.7118.90 Safari/537.36 Edg/134.0.3310.111",
  Referer: "https://y.qq.com/",
  "Content-Type": "application/json",
  Cookie: process.env.QQ_MUSIC_COOKIE || "",
};

interface QQRequest {
  method: string;
  module: string;
  param: Record<string, any>;
}

async function qqRequest(req: QQRequest): Promise<any> {
  const payload = {
    comm: { ...COMM },
    request: {
      method: req.method,
      module: req.module,
      param: req.param,
    },
  };

  const res = await $fetch<any>(MUSICU_URL, {
    method: "POST",
    headers: HEADERS,
    body: payload,
  });

  const json = JSON.parse(res);

  if (json?.code !== 0) {
    throw new Error(`QQ API error: ${json?.code}`);
  }
  const requestData = json?.request;
  if (requestData?.code !== 0) {
    throw new Error(`QQ API request error: ${requestData?.code}`);
  }
  return requestData?.data || {};
}

export class QQScraper extends MusicScraper {
  constructor() {
    super("qq");
  }

  generateId(n: number): string {
    const hex = () =>
      ((Math.random() * 0xff) & 0x0f).toString(16).toUpperCase();
    let result = "";
    while (n-- > 0) {
      result += hex();
    }
    return result;
  }

  async search(keyword: string): Promise<SearchResult[]> {
    try {
      const data = await qqRequest({
        method: "DoSearchForQQMusicDesktop",
        module: "music.search.SearchCgiService",
        param: {
          grp: 1,
          num_per_page: 20,
          page_num: 1,
          remoteplace: "txt.newclient.top",
          search_type: 0,
          searchid: this.generateId(37),
          query: keyword,
        },
      });

      const songList: any[] = data?.body?.song?.list || [];

      return songList.map((s) => {
        const albumMid = (s.album || {}).mid || "";
        const firstV: any = s.vs.find((v: any) => v) || "";
        const cover = albumMid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`
          : firstV
            ? `https://y.qq.com/music/photo_new/T062R300x300M000${firstV || ""}.jpg`
            : "";
        return {
          sourceId: s.mid || String(s.id),
          title: s.name || s.title || "",
          artist:
            (s.singer || [])
              .map((sk: any) => sk.name || sk.title)
              .join(" / ") || "",
          album: (s.album || {}).name || "",
          cover,
        };
      });
    } catch (e) {
      console.error("[QQScraper] search error:", e);
      return [];
    }
  }

  async detail(sourceId: string): Promise<ScrapeResult> {
    try {
      const data = await qqRequest({
        method: "get_song_detail_yqq",
        module: "music.pf_song_detail_svr",
        param: { song_mid: sourceId },
      });

      const track: any = data?.track_info || {};
      const singers =
        (track.singer || []).map((s: any) => s.name || "").join(" / ") || "";
      const album: any = track.album || {};
      const albumMid = album.mid || "";
      const albumName = album.name || album.title || "";
      const firstV: any = track.vs.find((v: any) => v) || "";
      const cover = albumMid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`
        : firstV
          ? `https://y.qq.com/music/photo_new/T062R300x300M000${firstV || ""}.jpg`
          : "";

      // 获取歌词
      let lyrics = "";
      try {
        const data = await $fetch<any>(
          "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg",
          {
            method: "GET",
            params: {
              songmid: sourceId,
              format: "json",
              nobase64: 1,
              outCharset: "utf-8",
              pcachetime: Date.now(),
            },
            headers: HEADERS,
          },
        );
        const json = JSON.parse(data);
        lyrics = this.lrcToTxt(json?.lyric || "");
      } catch {
        // 歌词获取失败不影响主流程
      }

      return {
        source: "qq",
        sourceId,
        title: track.name || "",
        artist: singers,
        album: albumName,
        cover,
        lyrics,
      };
    } catch (e) {
      console.error("[QQScraper] detail error:", e);
      return {
        source: "qq",
        sourceId,
        title: "",
        artist: "",
        album: "",
        cover: "",
      };
    }
  }

  async getUrl(sourceId: string) {
    return "";
  }
}
