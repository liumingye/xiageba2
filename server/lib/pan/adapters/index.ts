/**
 * 网盘厂商注册表。
 *
 * 全系统唯一的厂商分发入口：新增网盘 = 加一个 adapter 文件 + 在这里登记一行，
 * pan-instance / geturl / tree / list-dir / clean_temp / pan-info / check-account
 * 等调用点全部通过 getAdapterByType / getAdapterByClient 取适配器，不再写分支。
 */
import type { PanType } from "../types";
import type { PanAdapter, PanClient } from "./types";
import { quarkUCAdapter } from "./quarkuc";
import { baiduAdapter } from "./baidu";
import { xunleiAdapter } from "./xunlei";
import { guangyaAdapter } from "./guangya";
import { c139Adapter } from "./c139";

export const PAN_ADAPTERS: PanAdapter[] = [
  quarkUCAdapter,
  baiduAdapter,
  xunleiAdapter,
  guangyaAdapter,
  c139Adapter,
];

/** 按网盘类型（account.type / 分享链接解析结果）查找适配器 */
export function getAdapterByType(type: string): PanAdapter | undefined {
  return PAN_ADAPTERS.find((a) => a.types.includes(type as PanType));
}

/** 按客户端实例查找适配器（替代散落的 instanceof 分支） */
export function getAdapterByClient(client: PanClient): PanAdapter | undefined {
  return PAN_ADAPTERS.find((a) => client instanceof a.clientClass);
}
