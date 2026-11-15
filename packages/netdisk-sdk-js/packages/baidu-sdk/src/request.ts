import { type Method } from "@netdisk-sdk/utils";
import { type Request } from "superagent";
import { type BaiduClient } from "./client";

/** 三个 API 类共用的请求分派：相对路径补前缀 + 按方法名转发 */
export const dispatchRequest = (
  client: BaiduClient,
  prefix: string,
  method: Method,
  url: string,
): Request => {
  const target = url.startsWith("/") ? prefix + url : url;
  return (client.agentApi as any)[method.toLowerCase()](target) as Request;
};