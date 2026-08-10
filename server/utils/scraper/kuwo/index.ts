import { MusicScraper, type ScrapeResult, type SearchResult } from "../index";
import { inflate } from "zlib";
import iconv from "iconv-lite";

export class KuwoScraper extends MusicScraper {
  constructor() {
    super("kuwo");
  }

  unescapeHtml(str: string) {
    if (!str) return str;
    return str
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&");
  }

  async search(keyword: string): Promise<SearchResult[]> {
    try {
      let data = await this.fetchJson<any>(
        `https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&ft=music&pn=0&rn=20&rformat=json&encoding=utf8&vipver=1`,
        {
          Referer: "https://www.kuwo.cn/",
        },
      );
      data = data.replaceAll("'", '"').replaceAll("\\\\\\\\u", "\\u");

      const json = JSON.parse(data);

      const songs = json?.abslist || [];

      return songs.map((s: any) => ({
        sourceId: s.MUSICRID.replace("MUSIC_", ""),
        title: this.unescapeHtml(s.SONGNAME || ""),
        artist: this.unescapeHtml(s.ARTIST || ""),
        album: this.unescapeHtml(s.ALBUM || ""),
        cover: s.web_albumpic_short
          ? `https://img1.kuwo.cn/star/albumcover/${s.web_albumpic_short}`
          : `https://img1.kuwo.cn/star/starheads/${s.web_artistpic_short}`,
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
        Referer: "https://www.kuwo.cn/",
      },
    );

    const json = JSON.parse(data);

    const song = json[0] || {};

    // 获取歌词
    let lyrics = "";
    try {
      // 1. 预编译常量与 Buffer（避免每次调用重复创建）
      const BUF_KEY = Buffer.from("yeelion");
      const BUF_KEY_LEN = BUF_KEY.length;

      /**
       * 构造酷我参数 XOR 加密算法
       */
      function buildParams(id: string): string {
        const params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}&lrcx=1`;
        const bufStr = Buffer.from(params);
        const len = bufStr.length;
        const output = Buffer.allocUnsafe(len);

        for (let i = 0; i < len; i++) {
          output[i] = bufStr[i] ^ BUF_KEY[i % BUF_KEY_LEN];
        }
        return output.toString("base64");
      }

      /**
       * 解密酷我返回的歌词 Buffer (跳过多余的 base64 / String 转换，直接在 Buffer 层面处理)
       */
      async function decodeLyricsBuffer(buf: Buffer): Promise<string> {
        if (buf.toString("utf8", 0, 10) !== "tp=content") return "";

        // 1. 寻找 HTTP Header 结束标识符 \r\n\r\n (索引+4)
        const headerEndIndex = buf.indexOf("\r\n\r\n");
        if (headerEndIndex === -1) return "";

        const compressedData = buf.subarray(headerEndIndex + 4);

        // 2. 解压缩
        const decompressedData = await new Promise<Buffer>(
          (resolve, reject) => {
            inflate(compressedData, (err, result) =>
              err ? reject(err) : resolve(result),
            );
          },
        );

        // 3. 直接在二进解密层 XOR 计算 (基于 base64 出来的真实 Buffer)
        const base64Buf = Buffer.from(
          decompressedData.toString("ascii"),
          "base64",
        );
        const len = base64Buf.length;
        const decrypted = Buffer.allocUnsafe(len);

        for (let i = 0; i < len; i++) {
          decrypted[i] = base64Buf[i] ^ BUF_KEY[i % BUF_KEY_LEN];
        }

        // 4. GB18030 转码为最终字符串
        return iconv.decode(decrypted, "gb18030");
      }

      /**
       * 核心：直接提取并清洗流式歌词文本（一步到位，去时间戳与合并翻译）
       */
      function parseAndMergeRawLyrics(rawText: string): string {
        if (!rawText) return "";

        const lines = rawText.split(/\r?\n/);

        // 用于清洗单行文本的正则（去除 <0,0> 逐字时间戳 和 行首时间戳 [00:00.000] 及 [tags]）
        const REG_WORD_TIME = /<\d+,-?\d+>/g;
        const REG_TAGS = /\[(ver|ti|ar|al|offset|by|kuwo):.*?\]/gi;
        const REG_TIME_LINE = /^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;

        // 用于存储时间戳对齐后的歌词组
        // key: 时间戳毫秒数; value: { timeMs, orig: string, trans: string }
        const timeMap = new Map<
          number,
          { timeMs: number; orig: string; trans: string }
        >();

        // 用来按顺序保存出现的 timeMs 顺序
        const timeOrder: number[] = [];

        for (let i = 0; i < lines.length; i++) {
          const rawLine = lines[i].trim();
          if (!rawLine) continue;

          // 过滤元数据标签 [ti:xxx], [ar:xxx]
          if (REG_TAGS.test(rawLine)) continue;

          const timeMatch = rawLine.match(REG_TIME_LINE);
          if (!timeMatch) continue;

          // 解析毫秒数：[分, 秒, 毫秒]
          const minutes = parseInt(timeMatch[1], 10);
          const seconds = parseInt(timeMatch[2], 10);
          const msStr = (timeMatch[3] || "0").padEnd(3, "0");
          const ms = parseInt(msStr, 10);
          const timeMs = minutes * 60000 + seconds * 1000 + ms;

          // 清洗得到纯文本
          const cleanedText = rawLine
            .replace(REG_TIME_LINE, "")
            .replace(REG_WORD_TIME, "")
            .replace(REG_TAGS, "")
            .trim();

          // 如果清洗完是纯空行，跳过
          if (!cleanedText) continue;

          // 根据时间戳对齐合并
          if (timeMap.has(timeMs)) {
            const item = timeMap.get(timeMs)!;
            // 同一时间戳第二次出现，填充为翻译 (trans)
            if (!item.trans) {
              item.trans = cleanedText;
            } else {
              // 如果已经有翻译，追加到翻译末尾
              item.trans += " " + cleanedText;
            }
          } else {
            // 第一次出现，作为原歌词 (orig)
            timeMap.set(timeMs, { timeMs, orig: cleanedText, trans: "" });
            timeOrder.push(timeMs);
          }
        }

        // 拼接输出结果
        const result: string[] = [];

        for (const timeMs of timeOrder) {
          const item = timeMap.get(timeMs);
          if (!item) continue;

          if (item.orig) result.push(item.orig);
          if (item.trans) result.push(item.trans);
        }

        return result.join("\n");
      }

      /**
       * 主入口函数
       */
      async function getKuwoMergedRawLyrics(sourceId: string): Promise<string> {
        try {
          // 1. 发起网络请求
          const lrcArrayBuffer = await $fetch<ArrayBuffer>(
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

          // 2. 解密二进制
          const decodedLrcText = await decodeLyricsBuffer(
            Buffer.from(lrcArrayBuffer),
          );

          // 3. 一步到位清洗并交叉合并返回
          return parseAndMergeRawLyrics(decodedLrcText);
        } catch (error) {
          console.error("处理酷我歌词失败:", error);
          return "";
        }
      }

      lyrics = await getKuwoMergedRawLyrics(sourceId);
    } catch {
      // 歌词获取失败不影响主流程
    }

    return {
      source: "kuwo",
      sourceId,
      title: song.name || "",
      artist: song.artist || "",
      album: song.album || "",
      cover: (song.albumpic || song.artistPic || "").replace(
        "http://",
        "https://",
      ),
      lyrics,
    };
  }

  async getUrl(sourceId: string) {
    return "";
  }
}
