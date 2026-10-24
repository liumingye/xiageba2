import { type Transporter, createTransport } from "nodemailer";
import "dotenv/config";
import { getConfigValue } from "#server/lib/configCache";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

let transporter: Transporter | null = null;

/**
 * 🔒 HTML 转义：插入邮件模板的所有字段必须先过这里。
 * musicTitle / musicArtist 等数据的源头是用户反馈与爬取内容，
 * 未转义即插入 HTML 邮件可在收件人客户端注入任意标记（钓鱼链接 / 伪表单）。
 */
const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getTransporter = (siteShortTitle: string): Transporter | null => {
  const config: EmailConfig = {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "noreply@example.com",
    fromName: siteShortTitle,
  };

  if (!config.host || !config.user || !config.pass) {
    console.warn("邮件服务未配置，跳过发送邮件");
    return null;
  }

  if (!transporter) {
    transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  return transporter;
};

export const sendEmail = async (
  options: SendEmailOptions,
): Promise<boolean> => {
  const siteShortTitle =
    process.env.SMTP_FROM_NAME ||
    (await getConfigValue("site_seo_short_title")) ||
    "下歌吧";

  const transport = getTransporter(siteShortTitle);
  if (!transport) {
    console.warn("邮件服务未配置，无法发送邮件");
    return false;
  }

  const fromName = siteShortTitle;
  const fromEmail = process.env.SMTP_FROM || "noreply@example.com";

  // 🔒 发件人显示名剥离引号与换行，杜绝 SMTP 头注入
  const safeFromName = fromName.replace(/["<>\r\n]/g, "").trim() || "系统通知";

  try {
    await transport.sendMail({
      from: `"${safeFromName}" <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    console.log(`邮件已发送至 ${options.to}`);
    return true;
  } catch (error: any) {
    console.error(`发送邮件失败: ${error.message}`);
    return false;
  }
};

export const sendFeedbackResolvedEmail = async (
  email: string,
  musicId: string,
  musicTitle: string,
  musicArtist: string,
  feedbackType: string,
): Promise<boolean> => {
  const typeLabels: Record<string, string> = {
    BROKEN_LINK: "网盘链接失效",
    WRONG_CONTENT: "网盘内容错误",
    WRONG_CODE: "提取码错误",
    WRONG_QUALITY: "音质问题",
    WRONG_INFO: "信息错误",
  };
  const siteShortTitle =
    process.env.SMTP_FROM_NAME ||
    (await getConfigValue("site_seo_short_title")) ||
    "下歌吧";
  const typeLabel = typeLabels[feedbackType] || feedbackType;
  const siteHost = process.env.SITE_HOST || "";
  const musicUrl = siteHost
    ? `${siteHost.replace(/\/$/, "")}/music/${musicId}`
    : "";

  // 🔒 所有插值字段统一转义后再进入 HTML 模板
  const safeTitle = escapeHtml(musicTitle);
  const safeArtist = escapeHtml(musicArtist);
  const safeTypeLabel = escapeHtml(typeLabel);
  const safeSiteShortTitle = escapeHtml(siteShortTitle);
  const safeMusicUrl = escapeHtml(musicUrl);

  const subject = `您反馈的问题已处理 - ${musicTitle}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">您好！</h2>
      <p style="color: #666; line-height: 1.6;">
        您反馈的问题已得到处理，感谢您的耐心等待。
      </p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>歌曲：</strong>${safeTitle}</p>
        <p style="margin: 0 0 10px 0;"><strong>歌手：</strong>${safeArtist}</p>
        <p style="margin: 0 0 10px 0;"><strong>反馈类型：</strong>${safeTypeLabel}</p>
        <p style="margin: 0;"><strong>处理状态：</strong><span style="color: #22c55e;">已处理</span></p>
      </div>
      ${
        musicUrl
          ? `
      <p style="color: #666; line-height: 1.6;">
        点击下方链接查看歌曲详情：
      </p>
      <p style="margin: 10px 0 20px 0;">
        <a href="${safeMusicUrl}" style="color: #6366f1; text-decoration: none; word-break: break-all;">${safeMusicUrl}</a>
      </p>
      `
          : ""
      }
      <p style="color: #666; line-height: 1.6;">
        如果您还有其他问题，欢迎继续向我们反馈。
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">
        此邮件由${safeSiteShortTitle}系统自动发送，请勿回复。
      </p>
    </div>
  `;

  return sendEmail({ to: email, subject, html });
};
