export const parseTools = {
  rxps: {
    info: /^{"/,
  },
  msFormat(timeMs: number) {
    if (Number.isNaN(timeMs)) return "";
    let ms = timeMs % 1000;
    timeMs /= 1000;
    let m = parseInt(timeMs / 60 + "")
      .toString()
      .padStart(2, "0");
    timeMs %= 60;
    let s = parseInt(timeMs + "")
      .toString()
      .padStart(2, "0");
    return `[${m}:${s}.${ms}]`;
  },
  parseHeaderInfo(str: string) {
    str = str.trim();
    str = str.replace(/\r/g, "");
    if (!str) return null;
    const lines = str.split("\n");
    return lines.map((line: string) => {
      if (line === "[00:00.00]//") return "";
      if (!this.rxps.info.test(line)) return line;
      try {
        const info = JSON.parse(line);
        const timeTag = this.msFormat(info.t);
        return timeTag
          ? `${timeTag}${info.c.map((t: { tx: string }) => t.tx).join("")}`
          : "";
      } catch {
        return "";
      }
    });
  },
  parse(lrc: string, tlrc?: string) {
    let lyric = lrc || tlrc || "";

    if (lrc) {
      const lrcLines = this.parseHeaderInfo(lrc);
      if (lrcLines) {
        // 时间戳精准匹配处理函数
        const parseTimeToMs = (line: string) => {
          const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/);
          if (!match || !match[1] || !match[2]) return null;
          const m = parseInt(match[1], 10);
          const s = parseInt(match[2], 10);
          const ms = parseInt((match[3] || "0").padEnd(3, "0"), 10);
          return m * 60000 + s * 1000 + ms;
        };

        const REG_TAGS = /\[(ver|ti|ar|al|offset|by|kuwo):.*?\]/gi;

        // 收集时间和行信息
        const timeMap = new Map();
        const timeOrder: number[] = [];

        // 解析原歌词 (lrc)
        lrcLines.forEach((line: string) => {
          line = line.trim();
          if (!line || REG_TAGS.test(line)) return;

          const timeMs = parseTimeToMs(line);

          if (timeMs !== null && line && !timeMap.has(timeMs)) {
            timeMap.set(timeMs, { line, tline: "" });
            timeOrder.push(timeMs);
          }
        });

        // 解析翻译歌词 (tlrc) 并精准匹配时间戳
        if (tlrc) {
          const tlrcLines = this.parseHeaderInfo(tlrc);
          if (tlrcLines) {
            tlrcLines.forEach((line: string) => {
              line = line.trim();
              if (!line || REG_TAGS.test(line)) return;

              const timeMs = parseTimeToMs(line);
              if (timeMs !== null && line && timeMap.has(timeMs)) {
                timeMap.get(timeMs).tline = line;
              }
            });
          }
        }

        // 重新组装按时间戳严密对齐后的文本数组
        const mergedLrc = [];

        for (const timeMs of timeOrder) {
          const item = timeMap.get(timeMs);
          if (item.line) mergedLrc.push(item.line); // 原歌词行
          if (item.tline) mergedLrc.push(item.tline); // 相同时间戳的翻译行
        }

        lyric = mergedLrc.join("\n");
      }
    }

    return lyric;
  },
};
