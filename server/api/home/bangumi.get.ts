import axios from "axios";

const API_URL = "https://bgmapi.anibt.net/calendar";

interface RawImageSet {
  large?: string;
  common?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

interface RawItem {
  id?: number;
  url?: string;
  name?: string;
  name_cn?: string;
  air_date?: string;
  air_weekday?: number;
  rating?: { score?: number; total?: number };
  collection?: { doing?: number };
  images?: RawImageSet;
}

interface RawDay {
  weekday?: { id?: number; en?: string; cn?: string; ja?: string };
  items?: RawItem[];
}

interface BangumiItem {
  id: number;
  name: string;
  airDate: string;
  score: number;
  image: string;
}

interface BangumiDay {
  id: number;
  cn: string;
  items: BangumiItem[];
}

/** 接口图片为 http，统一升级为 https，避免站点 HTTPS 下的混合内容拦截 */
function toHttps(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://")) return "https://" + url.slice(7);
  return url;
}

function mapItem(item: RawItem): BangumiItem {
  const images = item.images || {};
  return {
    id: item.id || 0,
    name: (item.name_cn || item.name || "").trim(),
    airDate: item.air_date || "",
    score: Number(item.rating?.score || 0),
    image: toHttps(images.large || images.common || images.medium || ""),
  };
}

export default defineCachedEventHandler(
  async () => {
    try {
      const res = await axios.get<RawDay[]>(API_URL, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        timeout: 15000,
      });

      const days: BangumiDay[] = (Array.isArray(res.data) ? res.data : [])
        .map((day, index) => ({
          id: Number(day?.weekday?.id || index + 1),
          cn: day?.weekday?.cn || "",
          items: (day?.items || []).map(mapItem).filter((v) => v.name),
        }))
        .filter((day) => day.id >= 1 && day.id <= 7);

      days.sort((a, b) => a.id - b.id);
      return { days };
    } catch {
      return { days: [] as BangumiDay[] };
    }
  },
  {
    name: "bangumi",
    maxAge: 6 * 60 * 60,
    staleMaxAge: 24 * 60 * 60,
    swr: true,
  },
);
