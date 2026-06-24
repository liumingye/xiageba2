import { MusicScraper, type ScrapeResult, type SearchResult } from "../index";
import { inflate } from "zlib";
import iconv from "iconv-lite";

export class KuwoScraper extends MusicScraper {
  constructor() {
    super("kuwo");
  }

  async search(keyword: string): Promise<SearchResult[]> {
    try {
      let data = await this.fetchJson<any>(
        `https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&ft=music&pn=0&rn=10&rformat=json&encoding=utf8&vipver=1`,
        {
          Referer: "http://www.kuwo.cn/",
        },
      );
      data = data.replace(/'/g, '"').replace(/&nbsp;/g, " ");

      const json = JSON.parse(data);

      const songs = json?.abslist || [];
      return songs.map((s: any) => ({
        sourceId: s.MUSICRID.replace("MUSIC_", ""),
        title: s.SONGNAME || "",
        artist: s.ARTIST || "",
        album: s.ALBUM || "",
        cover: s.web_albumpic_short
          ? `https://img1.kuwo.cn/star/albumcover/${s.web_albumpic_short}`
          : "",
      }));
    } catch (e) {
      console.error("[KuwoScraper] search error:", e);
      return [];
    }
  }

  async detail(sourceId: string): Promise<ScrapeResult> {
    // 酷我提供播放接口获取歌曲详情和播放链接
    const data = await this.fetchJson<any>(
      `https://datacenter.kuwo.cn/d.c?cmd=query&ft=music&force=no&resenc=utf8&cmkey=plist_pl2012&nation=1&isdownload=1&fpay=1&ids=${sourceId}`,
      {
        Referer: "http://www.kuwo.cn/",
      },
    );

    const json = JSON.parse(data);
    console.log(json);

    const song = json[0] || {};

    // 获取歌词
    let lyrics = "";
    try {
      const bufkey = Buffer.from("yeelion");
      const bufkeylen = bufkey.length;

      const isGetLyricx = true;

      const buildParams = (id: string) => {
        let params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}`;
        if (isGetLyricx) params += "&lrcx=1";
        const bufstr = Buffer.from(params);
        const bufstrlen = bufstr.length;
        const output = new Uint16Array(bufstrlen);
        let i = 0;
        while (i < bufstrlen) {
          let j = 0;
          while (j < bufkeylen && i < bufstrlen) {
            // eslint-disable-next-line no-bitwise
            output[i] = bufkey[j] ^ bufstr[i];
            i++;
            j++;
          }
        }
        return Buffer.from(output).toString("base64");
      };
      const handleInflate = (data: Buffer) =>
        new Promise((resolve, reject) => {
          inflate(data, (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
        });
      const decodeLyrics = async (buf: Buffer) => {
        if (buf.toString("utf8", 0, 10) !== "tp=content") return "";
        const lrcData: any = await handleInflate(
          buf.subarray(buf.indexOf("\r\n\r\n") + 4),
        );

        if (!isGetLyricx) return iconv.decode(lrcData, "gb18030");
        const bufStr = Buffer.from(lrcData.toString(), "base64");
        const bufStrLen = bufStr.length;
        const output = new Uint16Array(bufStrLen);
        let i = 0;
        while (i < bufStrLen) {
          let j = 0;
          while (j < bufkeylen && i < bufStrLen) {
            // eslint-disable-next-line no-bitwise
            output[i] = bufStr[i] ^ bufkey[j];
            i++;
            j++;
          }
        }
        return iconv.decode(Buffer.from(output), "gb18030");
      };

      const rendererInvoke = async (lrcBase64: string) => {
        const lrc = await decodeLyrics(Buffer.from(lrcBase64, "base64"));
        return Buffer.from(lrc).toString("utf8");
      };

      const lrcData = await $fetch<any>(
        `http://newlyric.kuwo.cn/newlyric.lrc?${buildParams(sourceId)}`,
        {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6904.90 Safari/537.36 Edg/134.0.3111.110",
          },
          responseType: "arrayBuffer",
        },
      );

      const lrcText = await rendererInvoke(
        Buffer.from(lrcData).toString("base64"),
      );

      const sortLrcArr = (arr) => {
        const lrcSet = new Set();
        let lrc = [];
        let lrcT = [];

        let isLyricx = false;
        for (const item of arr) {
          if (lrcSet.has(item.time)) {
            if (lrc.length < 2) continue;
            const tItem = lrc.pop();
            tItem.time = lrc[lrc.length - 1].time;
            lrcT.push(tItem);
            lrc.push(item);
          } else {
            lrc.push(item);
            lrcSet.add(item.time);
          }
          if (!isLyricx && lyricxTag.test(item.text)) isLyricx = true;
        }

        if (
          !isLyricx &&
          lrcT.length > lrc.length * 0.3 &&
          lrc.length - lrcT.length > 6
        ) {
          throw new Error("failed");
        }

        return {
          lrc,
          lrcT,
        };
      };

      const transformLrc = (tags, lrclist) => {
        return `${tags.join("\n")}\n${lrclist ? lrclist.map((l) => `[${l.time}]${l.text}\n`).join("") : "暂无歌词"}`;
      };

      const timeExp = /^\[([\d:.]*)\]{1}/g;
      // const existTimeExp = /\[\d{1,2}:.*\d{1,4}\]/;
      const lyricxTag = /^<-?\d+,-?\d+>/;

      const parseLrc = (lrc) => {
        const lines = lrc.split(/\r\n|\r|\n/);
        let tags = [];
        let lrcArr = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          let result = timeExp.exec(line);
          if (result) {
            const text = line.replace(timeExp, "").trim();
            let time = RegExp.$1;
            if (/\.\d\d$/.test(time)) time += "0";
            lrcArr.push({
              time,
              text,
            });
          } else if (
            /\[(ver|ti|ar|al|offset|by|kuwo):\s*(\S+(?:\s+\S+)*)\s*\]/.test(
              line,
            )
          ) {
            tags.push(line);
          }
        }
        const lrcInfo = sortLrcArr(lrcArr);
        return {
          lyric: transformLrc(tags, lrcInfo.lrc),
          tlyric: lrcInfo.lrcT.length ? transformLrc(tags, lrcInfo.lrcT) : "",
        };
      };

      lyrics = parseLrc(lrcText).lyric || "";
      lyrics = lyrics.replace(/<(-?\d+),(-?\d+)(?:,-?\d+)?>/g, "");
      lyrics = this.lrcToTxt(lyrics);
    } catch {
      // 歌词获取失败不影响主流程
    }

    const cover = song.albumpic || "";

    return {
      source: "kuwo",
      sourceId,
      title: song.name || "",
      artist: song.artist || "",
      album: song.album || "",
      cover,
      lyrics,
    };
  }

  async getUrl(sourceId: string) {
    return "";
  }
}
