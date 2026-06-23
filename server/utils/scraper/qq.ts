import { MusicScraper, type ScrapeResult, type SearchResult } from "./index";

const MUSICU_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg";

const COMM = {
  ct: 11,
  cv: "2111",
  v: "2111",
  os_ver: "15",
  tmeAppID: "qqmusic",
  nettype: "NETWORK_WIFI",
  udid: "0",
};

const HEADERS = {
  "User-Agent": "okhttp/3.14.9",
  Referer: "https://y.qq.com/",
  "Content-Type": "application/json",
  Cookie: "tmeLoginType=-1;",
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

  async search(keyword: string): Promise<SearchResult[]> {
    try {
      const data = await qqRequest({
        method: "DoSearchForQQMusicDesktop",
        module: "music.search.SearchCgiService",
        param: {
          search_id: "",
          remoteplace: "search.android.keyboard",
          query: keyword,
          search_type: 0,
          num_per_page: 10,
          page_num: 1,
          highlight: 0,
          nqc_flag: 0,
          page_id: 1,
          grp: 1,
        },
      });

      const songList: any[] = data?.body?.song?.list || [];
      console.log("[QQScraper] search data:", data);
      return songList.map((s) => ({
        sourceId: s.mid || String(s.id),
        title: s.name || s.title || "",
        artist:
          (s.singer || []).map((sk: any) => sk.name || sk.title).join(" / ") ||
          "",
        album: (s.album || {}).name || "",
        cover: s.mid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${(s.album || {}).mid || ""}.jpg`
          : "",
      }));
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
      const cover = albumMid
        ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
        : "";

      // 获取播放链接
      let playUrl = "";
      try {
        const urlData = await qqRequest({
          method: "get_song_url",
          module: "music.streamShopService",
          param: {
            song_mid: sourceId,
            song_type: 0,
            bitrate: 320,
            filename: `M500${sourceId}.mp3`,
          },
        });
        playUrl = urlData?.midurlinfo?.[0]?.purl || "";
      } catch {
        // 播放链接获取失败不影响主流程
      }

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
}
