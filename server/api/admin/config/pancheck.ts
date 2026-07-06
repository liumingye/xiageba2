import {
  getConfigValues,
  setConfigValues,
} from "#server/lib/configCache";

const PANCHECK_KEYS = ["pancheck_servers"];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues(PANCHECK_KEYS);
    // 返回数组格式：每个条目为 url@@password
    const servers = (result.pancheck_servers || "")
      .split("\n")
      .filter((s: string) => s.trim())
      .map((s: string) => {
        const [url, password] = s.split("@@");
        return { url: url || "", password: password || "" };
      });
    return { data: { servers } };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const servers = body?.servers || [];
    // 将数组转换为换行分隔的字符串
    const value = servers
      .map((s: { url: string; password: string }) =>
        `${s.url || ""}@@${s.password || ""}`,
      )
      .join("\n");
    await setConfigValues([{ key: "pancheck_servers", value }]);
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});