import { getConfigValues, setConfigValues } from "#server/lib/configCache";

const PANCHECK_KEYS = ["pancheck_servers"];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const raw = await getConfigValues(PANCHECK_KEYS);
    const servers = (raw.pancheck_servers || "")
      .split("\n")
      .filter((s: string) => s.length > 0);
    return { data: { servers } };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const servers: string[] = Array.isArray(body?.servers) ? body.servers : [];
    const value = servers
      .map((s: string) => (s || "").trim())
      .filter((s: string) => s.length > 0)
      .join("\n");
    await setConfigValues([{ key: "pancheck_servers", value }]);
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
