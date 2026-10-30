import QRCode from "qrcode";
import {
  createQrSession,
  pollQrSession,
  isQrLoginSupported,
  type QrLoginType,
  type QrSessionContext,
} from "#server/lib/pan/qr-login";

/**
 * 网盘二维码登录会话（内存态）
 *
 * 与 rebuild-search 的 isRebuilding 同理：当前 docker-compose 是单 app 实例，
 * 内存 Map 足够；多副本部署时需换成 Redis。会话 5 分钟过期，轮询时会惰性清理。
 */

const SESSION_TTL_MS = 5 * 60 * 1000;

interface QrSession {
  type: QrLoginType;
  ctx: QrSessionContext;
  createdAt: number;
}

const sessions = new Map<string, QrSession>();

function cleanExpired() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function genSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const action = String(body?.action || "");

  // 创建二维码
  if (action === "create") {
    const type = String(body?.type || "").toLowerCase();
    if (!isQrLoginSupported(type)) {
      throw createError({
        statusCode: 400,
        message: "该网盘不支持二维码登录",
      });
    }

    cleanExpired();

    const { ctx, qrContent, isImageUrl } = await createQrSession(
      type as QrLoginType,
    );
    const sessionId = genSessionId();
    sessions.set(sessionId, {
      type: type as QrLoginType,
      ctx,
      createdAt: Date.now(),
    });

    // 百度返回图片直链，前端直接 <img> 加载；夸克/UC 由后端渲染成 dataURL
    const qrcode = isImageUrl
      ? qrContent
      : await QRCode.toDataURL(qrContent, { width: 220, margin: 1 });

    return { sessionId, qrcode, isImageUrl };
  }

  // 轮询扫码状态
  if (action === "poll") {
    const sessionId = String(body?.sessionId || "");
    const session = sessions.get(sessionId);
    if (!session) {
      throw createError({
        statusCode: 404,
        message: "会话不存在或已过期，请重新生成二维码",
      });
    }

    const result = await pollQrSession(session.ctx);

    // 确认成功或过期/出错后，清理会话
    if (result.status === "confirmed") {
      sessions.delete(sessionId);
      return { status: "confirmed", cookie: result.cookie };
    }
    if (result.status === "expired") {
      sessions.delete(sessionId);
      return { status: "expired" };
    }
    if (result.status === "error") {
      sessions.delete(sessionId);
      return { status: "error", message: result.message };
    }

    return { status: result.status };
  }

  throw createError({ statusCode: 400, message: "缺少 action 参数" });
});
