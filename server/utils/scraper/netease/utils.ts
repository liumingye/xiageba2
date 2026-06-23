export const parseTools = {
  rxps: {
    info: /^{"/,
    lineTime: /^\[(\d+),\d+\]/,
    wordTime: /\(\d+,\d+,\d+\)/,
    wordTimeAll: /(\(\d+,\d+,\d+\))/g,
  },
  msFormat(timeMs) {
    if (Number.isNaN(timeMs)) return "";
    let ms = timeMs % 1000;
    timeMs /= 1000;
    let m = parseInt(timeMs / 60)
      .toString()
      .padStart(2, "0");
    timeMs %= 60;
    let s = parseInt(timeMs).toString().padStart(2, "0");
    return `[${m}:${s}.${ms}]`;
  },
  parseLyric(lines) {
    const lxlrcLines = [];
    const lrcLines = [];

    for (let line of lines) {
      line = line.trim();
      let result = this.rxps.lineTime.exec(line);
      if (!result) {
        if (line.startsWith("[offset")) {
          lxlrcLines.push(line);
          lrcLines.push(line);
        }
        continue;
      }

      const startMsTime = parseInt(result[1]);
      const startTimeStr = this.msFormat(startMsTime);
      if (!startTimeStr) continue;

      let words = line.replace(this.rxps.lineTime, "");

      lrcLines.push(
        `${startTimeStr}${words.replace(this.rxps.wordTimeAll, "")}`,
      );

      let times = words.match(this.rxps.wordTimeAll);
      if (!times) continue;
      times = times.map((time) => {
        const result = /\((\d+),(\d+),\d+\)/.exec(time);
        return `<${Math.max(parseInt(result[1]) - startMsTime, 0)},${result[2]}>`;
      });
      const wordArr = words.split(this.rxps.wordTime);
      wordArr.shift();
      const newWords = times
        .map((time, index) => `${time}${wordArr[index]}`)
        .join("");
      lxlrcLines.push(`${startTimeStr}${newWords}`);
    }
    return {
      lyric: lrcLines.join("\n"),
      lxlyric: lxlrcLines.join("\n"),
    };
  },
  parseHeaderInfo(str) {
    str = str.trim();
    str = str.replace(/\r/g, "");
    if (!str) return null;
    const lines = str.split("\n");
    return lines.map((line) => {
      if (!this.rxps.info.test(line)) return line;
      try {
        const info = JSON.parse(line);
        const timeTag = this.msFormat(info.t);
        return timeTag ? `${timeTag}${info.c.map((t) => t.tx).join("")}` : "";
      } catch {
        return "";
      }
    });
  },
  getIntv(interval) {
    if (!interval) return 0;
    if (!interval.includes(".")) interval += ".0";
    let arr = interval.split(/:|\./);
    while (arr.length < 3) arr.unshift("0");
    const [m, s, ms] = arr;
    return parseInt(m) * 3600000 + parseInt(s) * 1000 + parseInt(ms);
  },
  fixTimeTag(lrc, targetlrc) {
    let lrcLines = lrc.split("\n");
    const targetlrcLines = targetlrc.split("\n");
    const timeRxp = /^\[([\d:.]+)\]/;
    let temp = [];
    let newLrc = [];
    targetlrcLines.forEach((line) => {
      const result = timeRxp.exec(line);
      if (!result) return;
      const words = line.replace(timeRxp, "");
      if (!words.trim()) return;
      const t1 = this.getIntv(result[1]);

      while (lrcLines.length) {
        const lrcLine = lrcLines.shift();
        const lrcLineResult = timeRxp.exec(lrcLine);
        if (!lrcLineResult) continue;
        const t2 = this.getIntv(lrcLineResult[1]);
        if (Math.abs(t1 - t2) < 100) {
          const lrc = line.replace(timeRxp, lrcLineResult[0]).trim();
          if (!lrc) continue;
          newLrc.push(lrc);
          break;
        }
        temp.push(lrcLine);
      }
      lrcLines = [...temp, ...lrcLines];
      temp = [];
    });
    return newLrc.join("\n");
  },
  parse(ylrc, ytlrc, yrlrc, lrc, tlrc, rlrc) {
    const info = {
      lyric: "",
      tlyric: "",
      rlyric: "",
      lxlyric: "",
    };
    if (ylrc) {
      let lines = this.parseHeaderInfo(ylrc);
      if (lines) {
        const result = this.parseLyric(lines);
        if (ytlrc) {
          const lines = this.parseHeaderInfo(ytlrc);
          if (lines) {
            // if (lines.length == result.lyricLines.length) {
            info.tlyric = this.fixTimeTag(result.lyric, lines.join("\n"));
            // } else info.tlyric = lines.join('\n')
          }
        }
        if (yrlrc) {
          const lines = this.parseHeaderInfo(yrlrc);
          if (lines) {
            // if (lines.length == result.lyricLines.length) {
            info.rlyric = this.fixTimeTag(result.lyric, lines.join("\n"));
            // } else info.rlyric = lines.join('\n')
          }
        }

        const timeRxp = /^\[[\d:.]+\]/;
        const headers = lines.filter((l) => timeRxp.test(l)).join("\n");
        info.lyric = `${headers}\n${result.lyric}`;
        info.lxlyric = result.lxlyric;
        return info;
      }
    }
    if (lrc) {
      const lines = this.parseHeaderInfo(lrc);
      if (lines) info.lyric = lines.join("\n");
    }
    if (tlrc) {
      const lines = this.parseHeaderInfo(tlrc);
      if (lines) info.tlyric = lines.join("\n");
    }
    if (rlrc) {
      const lines = this.parseHeaderInfo(rlrc);
      if (lines) info.rlyric = lines.join("\n");
    }

    return info;
  },
};
