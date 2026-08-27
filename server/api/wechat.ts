import {
  createHash,
  createDecipheriv,
  createCipheriv,
  randomBytes,
} from "node:crypto";
import { getWechatConfig } from "#server/lib/wechatConfig";
import { prisma } from "#server/lib/prisma";
import {
  buildSearchWebQuery,
  cutForSearch,
  prioritizeSearchTokens,
} from "#server/utils/jieba";
import { automaton_websearch_filter_keywords } from "#server/lib/simpleAC";

const MAX_KEYWORD_LENGTH = 30;

/* =========================================================================
 *  1. 微信消息签名 / XML 解析 / 回复构造 / 加解密
 * ========================================================================= */

function wechatVerifySignature(
  token: string,
  signature: string,
  timestamp: string,
  nonce: string,
): boolean {
  if (!token || !signature || !timestamp || !nonce) return false;
  const sorted = [token, timestamp, nonce].sort().join("");
  const digest = createHash("sha1").update(sorted).digest("hex");
  return digest === signature;
}

function wechatMsgSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
): string {
  const sorted = [token, timestamp, nonce, encrypt].sort().join("");
  return createHash("sha1").update(sorted).digest("hex");
}

function decodeAESKey(encodingAESKey: string): Buffer {
  return Buffer.from(encodingAESKey + "=", "base64");
}

function decryptWechatMessage(
  encrypt: string,
  encodingAESKey: string,
): { msg: string; appId: string } {
  const aesKey = decodeAESKey(encodingAESKey);
  const iv = aesKey.subarray(0, 16);
  const encryptedData = Buffer.from(encrypt, "base64");

  const decipher = createDecipheriv("aes-256-cbc", aesKey, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  // 微信 AES 加密块大小为 32，解密后数据长度至少大于 32 字节
  if (decrypted.length === 0) {
    throw new Error("Invalid encrypted message");
  }

  const pad = decrypted[decrypted.length - 1]!; // 此处可通过空值断言，或者通过判断让 TS 自动收窄
  const unpadded = decrypted.subarray(0, decrypted.length - pad);

  const msgLen = unpadded.readUInt32BE(16);
  const msg = unpadded.subarray(20, 20 + msgLen).toString("utf8");
  const appId = unpadded.subarray(20 + msgLen).toString("utf8");

  return { msg, appId };
}

function encryptWechatMessage(
  replyXml: string,
  encodingAESKey: string,
  appId: string,
): string {
  const aesKey = decodeAESKey(encodingAESKey);
  const iv = aesKey.subarray(0, 16);

  const random = randomBytes(16);
  const msgBuf = Buffer.from(replyXml, "utf8");
  const msgLenBuf = Buffer.alloc(4);
  msgLenBuf.writeUInt32BE(msgBuf.length, 0);
  const appIdBuf = Buffer.from(appId, "utf8");

  const raw = Buffer.concat([random, msgLenBuf, msgBuf, appIdBuf]);

  const blockSize = 32;
  const padLen = blockSize - (raw.length % blockSize);
  const padBuf = Buffer.alloc(padLen, padLen);
  const padded = Buffer.concat([raw, padBuf]);

  const cipher = createCipheriv("aes-256-cbc", aesKey, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

  return encrypted.toString("base64");
}

function buildEncryptedReply(
  encrypted: string,
  signature: string,
  timestamp: string,
  nonce: string,
): string {
  return (
    "<xml>" +
    `<Encrypt><![CDATA[${encrypted}]]></Encrypt>` +
    `<MsgSignature><![CDATA[${signature}]]></MsgSignature>` +
    `<TimeStamp>${timestamp}</TimeStamp>` +
    `<Nonce><![CDATA[${nonce}]]></Nonce>` +
    "</xml>"
  );
}

function parseWechatXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /<(\w+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const key = m[1];
    if (!key) continue;
    result[key] = (m[2] !== undefined ? m[2] : m[3] || "").trim();
  }
  return result;
}

function buildTextReply(
  toUser: string,
  fromUser: string,
  text: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  return (
    "<xml>" +
    `<ToUserName><![CDATA[${toUser}]]></ToUserName>` +
    `<FromUserName><![CDATA[${fromUser}]]></FromUserName>` +
    `<CreateTime>${now}</CreateTime>` +
    `<MsgType><![CDATA[text]]></MsgType>` +
    `<Content><![CDATA[${text}]]></Content>` +
    "</xml>"
  );
}

/* =========================================================================
 *  2. 搜索会话管理（内存缓存，按 openid 隔离）
 * ========================================================================= */

interface WechatSearchItem {
  type: "source" | "music";
  id: string;
  title: string;
  url?: string;
  description?: string;
  categoryName?: string;
  artist?: string;
  album?: string;
}

interface SearchSession {
  keyword: string;
  items: WechatSearchItem[];
  page: number;
  pageSize: number;
  createdAt: number;
}

const searchSessions = new Map<string, SearchSession>();
const SESSION_TTL = 5 * 60 * 1000;

function getSession(openid: string): SearchSession | null {
  const session = searchSessions.get(openid);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    searchSessions.delete(openid);
    return null;
  }
  return session;
}

function createSession(
  openid: string,
  keyword: string,
  items: WechatSearchItem[],
  pageSize: number,
): SearchSession {
  const session: SearchSession = {
    keyword,
    items,
    page: 1,
    pageSize,
    createdAt: Date.now(),
  };
  searchSessions.set(openid, session);
  return session;
}

function getTotalPages(session: SearchSession): number {
  return Math.max(1, Math.ceil(session.items.length / session.pageSize));
}

function getPageItems(session: SearchSession): WechatSearchItem[] {
  const start = (session.page - 1) * session.pageSize;
  return session.items.slice(start, start + session.pageSize);
}

/* =========================================================================
 *  3. 资源搜索
 * ========================================================================= */

async function searchResources(
  keyword: string,
  limit: number,
): Promise<WechatSearchItem[]> {
  if (
    automaton_websearch_filter_keywords &&
    automaton_websearch_filter_keywords.hasFullMatch(keyword.toLowerCase())
  ) {
    return [];
  }

  const tokens = prioritizeSearchTokens(cutForSearch(keyword));
  const keywordWebQuery = buildSearchWebQuery(tokens, false);
  if (!keywordWebQuery.trim()) return [];

  const items: WechatSearchItem[] = [];

  try {
    const sourceLimit = Math.max(1, Math.ceil(limit / 2));
    const sourceRows: any[] = await prisma.$queryRaw`
      WITH search_query AS (
        SELECT websearch_to_tsquery('simple', ${keywordWebQuery}) AS value
      )
      SELECT s.id, s.title, s.description, s.cid, s.url
      FROM "Source" s
      CROSS JOIN search_query
      WHERE s."status" = 1
        AND s."invalidNum" < 3
        AND search_query.value IS NOT NULL
        AND s."searchVector" @@ search_query.value
      ORDER BY ts_rank(s."searchVector", search_query.value, 1) DESC,
               s."createdAt" DESC
      LIMIT ${sourceLimit}
    `;
    const cids = [...new Set(sourceRows.map((r) => r.cid).filter(Boolean))];
    let categoryMap: Record<number, string> = {};
    if (cids.length > 0) {
      const categories = await prisma.category.findMany({
        where: { id: { in: cids } },
        select: { id: true, name: true },
      });
      for (const c of categories) categoryMap[c.id] = c.name;
    }
    for (const r of sourceRows) {
      items.push({
        type: "source",
        id: String(r.id),
        title: r.title,
        url: r.url,
        description: r.description,
        categoryName: r.cid ? categoryMap[r.cid] || "" : "",
      });
    }
  } catch (e) {
    // source search failed, continue to music
  }

  const remaining = limit - items.length;
  if (remaining > 0) {
    try {
      const musicRows: any[] = await prisma.$queryRaw`
        WITH pq AS (
          SELECT websearch_to_tsquery('simple', ${keywordWebQuery}) AS q
        )
        SELECT m.id, m.title, m.artist, m.album
        FROM "Music" m, pq
        WHERE pq.q IS NOT NULL
          AND m."searchVector" @@ pq.q
        ORDER BY ts_rank(m."searchVector", pq.q, 1) DESC,
                 m."viewCount" DESC,
                 m."createdAt" DESC
        LIMIT ${remaining}
      `;
      for (const r of musicRows) {
        items.push({
          type: "music",
          id: String(r.id),
          title: r.title,
          artist: r.artist,
          album: r.album,
        });
      }
    } catch (e) {
      // music search failed
    }
  }

  return items.slice(0, limit);
}

function formatSearchResultText(
  keyword: string,
  items: WechatSearchItem[],
  page: number,
  totalPages: number,
): string {
  if (items.length === 0) {
    return `未找到关键词「${keyword}」相关的资源，请换个关键词试试～`;
  }
  const lines: string[] = [
    `🔍「${keyword}」搜索结果（第${page}/${totalPages}页）：`,
    "",
  ];
  items.forEach((it, idx) => {
    const no = idx + 1;
    let sub = "";
    if (it.type === "source") {
      const desc = it.description
        ? it.description.replace(/\s+/g, " ").slice(0, 40)
        : "";
      sub = it.categoryName ? `[${it.categoryName}]` : "[资源]";
      if (desc) sub += ` ${desc}`;
    } else {
      const parts: string[] = [];
      if (it.artist) parts.push(it.artist);
      if (it.album) parts.push(`《${it.album}》`);
      sub = parts.length ? parts.join(" - ") : "[音乐]";
    }
    lines.push(`${no}. ${it.title}`);
    if (sub) lines.push(`   ${sub}`);
  });
  lines.push("");
  lines.push('💡 回复"数字序号"获取资源链接');
  if (totalPages > 1) {
    lines.push('📄 回复"下一页"查看更多');
  }
  return lines.join("\n");
}

function handleGetResourceLink(item: WechatSearchItem): string {
  const host = (process.env.SITE_HOST || "").replace(/\/+$/, "");
  if (item.type === "music") {
    return `🎵 ${item.title}\n${item.artist ? `歌手：${item.artist}\n` : ""}详情：${host}/music/${item.id}`;
  }
  return `📥 ${item.title}\n详情：${host}/source/${item.id}`;
}

/* =========================================================================
 *  4. 路由：GET 校验 + POST 消息处理
 * ========================================================================= */

export default defineEventHandler(async (event) => {
  const cfg = await getWechatConfig();

  if (event.method === "GET") {
    const q = getQuery(event) as {
      signature?: string;
      timestamp?: string;
      nonce?: string;
      echostr?: string;
    };

    const ok = wechatVerifySignature(
      cfg.token,
      q.signature || "",
      q.timestamp || "",
      q.nonce || "",
    );

    if (!ok) {
      throw createError({ statusCode: 403, message: "签名校验失败" });
    }
    setResponseHeader(event, "content-type", "text/plain");
    return q.echostr || "";
  }

  if (event.method === "POST") {
    if (!cfg.enabled || !cfg.token) {
      setResponseHeader(event, "content-type", "text/plain");
      return "success";
    }

    const q = getQuery(event) as {
      signature?: string;
      msg_signature?: string;
      timestamp?: string;
      nonce?: string;
      encrypt_type?: string;
    };

    const signatureOk = wechatVerifySignature(
      cfg.token,
      q.signature || "",
      q.timestamp || "",
      q.nonce || "",
    );

    if (!signatureOk) {
      throw createError({ statusCode: 403, message: "签名校验失败" });
    }

    const rawBody = await readRawBody(event, "utf8");

    let msg: Record<string, string>;
    let isEncrypted = false;

    const encryptMatch = (rawBody || "").match(
      /<Encrypt><!\[CDATA\[([\s\S]*?)\]\]><\/Encrypt>/,
    );

    if (encryptMatch) {
      const encryptContent = encryptMatch[1];

      if (!cfg.encodingAESKey) {
        setResponseHeader(event, "content-type", "text/plain");
        return "success";
      }

      if (!encryptContent) return;

      if (q.msg_signature) {
        const expectedMsgSig = wechatMsgSignature(
          cfg.token,
          q.timestamp || "",
          q.nonce || "",
          encryptContent,
        );
        if (expectedMsgSig !== q.msg_signature) {
          throw createError({ statusCode: 403, message: "消息签名校验失败" });
        }
      }

      try {
        const decrypted = decryptWechatMessage(
          encryptContent,
          cfg.encodingAESKey,
        );
        msg = parseWechatXml(decrypted.msg);
        isEncrypted = true;
      } catch {
        setResponseHeader(event, "content-type", "text/plain");
        return "success";
      }
    } else {
      msg = parseWechatXml(rawBody || "");
    }

    const msgType = msg.MsgType;
    const eventType = msg.Event;
    const fromUser = msg.FromUserName;
    const toUser = msg.ToUserName;
    const content = (msg.Content || "").trim();

    let replyText = "";

    if (msgType === "event") {
      if (eventType === "subscribe") {
        replyText = cfg.welcomeMessage || "谢谢关注！发送关键词即可搜索资源。";
      }
    } else if (msgType === "text") {
      if (!cfg.autoReplyEnabled) {
        replyText = "自动回复功能已关闭。";
      } else if (!content) {
        replyText = "请输入搜索关键词（最多30字）。";
      } else if (content.length > MAX_KEYWORD_LENGTH) {
        replyText = `关键词过长，最多 ${MAX_KEYWORD_LENGTH} 个字。`;
      } else {
        const lowerContent = content.toLowerCase();

        if (lowerContent === "上一页" || lowerContent === "prev") {
          if (!fromUser) return;
          const session = getSession(fromUser);
          if (!session) {
            replyText = "没有找到搜索记录，请先发送关键词搜索。";
          } else if (session.page <= 1) {
            replyText = "已经是第一页了。";
          } else {
            session.page--;
            const pageItems = getPageItems(session);
            replyText = formatSearchResultText(
              session.keyword,
              pageItems,
              session.page,
              getTotalPages(session),
            );
          }
        } else if (lowerContent === "下一页" || lowerContent === "next") {
          if (!fromUser) return;
          const session = getSession(fromUser);
          if (!session) {
            replyText = "没有找到搜索记录，请先发送关键词搜索。";
          } else if (session.page >= getTotalPages(session)) {
            replyText = "已经是最后一页了。";
          } else {
            session.page++;
            const pageItems = getPageItems(session);
            replyText = formatSearchResultText(
              session.keyword,
              pageItems,
              session.page,
              getTotalPages(session),
            );
          }
        } else if (
          lowerContent.startsWith("获取") ||
          lowerContent.startsWith("get")
        ) {
          if (!fromUser) return;
          const session = getSession(fromUser);
          if (!session) {
            replyText = "没有找到搜索记录，请先发送关键词搜索。";
          } else {
            const numStr = content.replace(/^(获取|get)\s*/i, "").trim();
            const index = parseInt(numStr, 10);
            if (isNaN(index) || index < 1) {
              replyText = '请输入正确的序号，如"获取 1"或"get 1"';
            } else {
              const pageItems = getPageItems(session);
              const targetItem = pageItems[index - 1];

              if (!targetItem) {
                replyText = `序号超出范围，当前页共 ${pageItems.length} 条结果。`;
              } else {
                replyText = handleGetResourceLink(targetItem);
              }
            }
          }
        } else if (/^\d+$/.test(content)) {
          if (!fromUser) return;
          const session = getSession(fromUser);
          const index = parseInt(content, 10);
          const pageItems = session ? getPageItems(session) : [];
          const targetItem = pageItems[index - 1];

          if (session && targetItem) {
            replyText = handleGetResourceLink(targetItem);
          } else {
            try {
              const limit = Math.max(1, Math.min(20, cfg.searchLimit || 5));
              const results = await searchResources(content, limit);
              const newSession = createSession(fromUser, content, results, 5);
              const newPageItems = getPageItems(newSession);
              replyText = formatSearchResultText(
                content,
                newPageItems,
                1,
                getTotalPages(newSession),
              );
            } catch {
              replyText = "搜索服务暂时不可用，请稍后重试。";
            }
          }
        } else {
          try {
            if (!fromUser) return;
            const limit = Math.max(1, Math.min(20, cfg.searchLimit || 5));
            const results = await searchResources(content, limit);
            const session = createSession(fromUser, content, results, 5);
            const pageItems = getPageItems(session);
            replyText = formatSearchResultText(
              content,
              pageItems,
              1,
              getTotalPages(session),
            );
          } catch {
            replyText = "搜索服务暂时不可用，请稍后重试。";
          }
        }
      }
    }

    if (replyText) {
      if (!fromUser || !toUser) return;
      const replyXml = buildTextReply(fromUser, toUser, replyText);

      if (isEncrypted && cfg.encodingAESKey && cfg.appId) {
        const encrypted = encryptWechatMessage(
          replyXml,
          cfg.encodingAESKey,
          cfg.appId,
        );
        const ts = String(Math.floor(Date.now() / 1000));
        const nonce = q.nonce || ts;
        const msgSig = wechatMsgSignature(cfg.token, ts, nonce, encrypted);
        const encryptedReply = buildEncryptedReply(
          encrypted,
          msgSig,
          ts,
          nonce,
        );
        setResponseHeader(event, "content-type", "application/xml");
        return encryptedReply;
      }

      setResponseHeader(event, "content-type", "application/xml");
      return replyXml;
    }

    setResponseHeader(event, "content-type", "text/plain");
    return "success";
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});

// 添加定期清理机制（每天清理一次过期 Session）
setInterval(
  () => {
    const now = Date.now();
    for (const [openid, session] of searchSessions.entries()) {
      if (now - session.createdAt > SESSION_TTL) {
        searchSessions.delete(openid);
      }
    }
  },
  24 * 60 * 60 * 1000,
);
