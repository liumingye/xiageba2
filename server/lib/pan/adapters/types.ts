/**
 * 网盘厂商适配器契约。
 *
 * 一家厂商的所有差异化逻辑（建客户端、列目录、健康检查、取昵称、删文件、
 * 转存、建树、保活）收进一个 PanAdapter 对象，上层只依赖这里的接口，
 * 不再出现 instanceof / switch 厂商分支。
 */
import type { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import type { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import type { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import type { GuangyaClient } from "@netdisk-sdk/guangya-sdk";
import type { C139Client } from "@netdisk-sdk/c139-sdk";
import type { H3Event, EventHandlerRequest } from "h3";
import type { PanAccount } from "#server/lib/accountCache";
import type {
  PanType,
  ParsedShare,
  TransferContext,
  TransferResult,
} from "../types";

/** 全部网盘客户端的联合类型 */
export type PanClient =
  | QuarkUCClient
  | BaiduClient
  | XunleiClient
  | GuangyaClient
  | C139Client;

/** 临时凭证（添加账号时预览/获取昵称用，不缓存、不写 token） */
export interface TempCredentials {
  type: string;
  cookie?: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: Date;
}

/** clean_temp 传入的待删除条目（id 为数据库主键，fids 为网盘侧文件/路径 id） */
export interface DeleteItem {
  id: number;
  fids: string[];
}

/**
 * 网盘厂商适配器。
 * 方法接收已创建的 client（由 pan-instance 统一创建/缓存），
 * adapter 不自行 import pan-instance，避免 pan-instance ↔ adapters 循环依赖。
 */
export interface PanAdapter {
  /** 厂商标识（对应 account.type），一个适配器可登记多个（如夸克/UC 同 SDK） */
  types: PanType[];
  /** 客户端类，供 getAdapterByClient 做 instanceof 匹配 */
  clientClass: new (...args: any[]) => any;
  /** 从账号记录创建客户端（缓存版，带 onRefreshToken 回写） */
  createClient(account: PanAccount): Promise<PanClient> | PanClient;
  /** 从临时凭证创建客户端（不缓存、不写 token） */
  createTempClient(params: TempCredentials): Promise<PanClient> | PanClient;
  /** 列出根目录下的子目录（管理端选择临时目录用） */
  listRootDirs(client: PanClient): Promise<{ id: string; name: string }[]>;
  /** 账号健康检查（抛错即失效） */
  check(client: PanClient): Promise<void>;
  /** 获取账号昵称 */
  getAccountName(client: PanClient): Promise<string>;
  /** 批量删除网盘文件，返回成功删除的数据库 id 列表 */
  deleteFiles(
    client: PanClient,
    items: DeleteItem[],
    account: PanAccount,
  ): Promise<number[]>;
  /** 转存分享链接到临时目录并创建新分享 */
  transfer(
    event: H3Event<EventHandlerRequest>,
    account: PanAccount,
    client: PanClient,
    ctx: TransferContext,
  ): Promise<TransferResult>;
  /** 构建分享链接的文件树文本 */
  buildTree(client: PanClient, parsed: ParsedShare): Promise<string>;
  /** 保活钩子（仅需要的厂商实现，如夸克/UC） */
  keepAlive?(client: PanClient): void;
}
