import { MusicScraper } from "./scraper/index";
import { KuwoScraper } from "./scraper/kuwo";
import { QQScraper } from "./scraper/qq";
import { NetEaseScraper } from "./scraper/netease";

export type Platform = "kuwo" | "qq" | "netease";

const SCRAPERS: Record<Platform, () => MusicScraper> = {
  kuwo: () => new KuwoScraper(),
  qq: () => new QQScraper(),
  netease: () => new NetEaseScraper(),
};

export function createScraper(platform: Platform): MusicScraper {
  const factory = SCRAPERS[platform];
  if (!factory) {
    throw new Error(`不支持的平台: ${platform}`);
  }
  return factory();
}

export * from "./scraper/index";
export * from "./scraper/kuwo";
export * from "./scraper/qq";
export * from "./scraper/netease";
