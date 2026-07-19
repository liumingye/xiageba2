import nodemailer from "nodemailer";
import "dotenv/config";

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

let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter | null => {
  const config: EmailConfig = {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "noreply@example.com",
    fromName: process.env.SMTP_FROM_NAME || "下歌吧",
  };

  if (!config.host || !config.user || !config.pass) {
    console.warn("邮件服务未配置，跳过发送邮件");
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
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

export const sendEmail = async (options: SendEmailOptions): Promise<boolean> => {
  const transport = getTransporter();
  if (!transport) {
    console.warn("邮件服务未配置，无法发送邮件");
    return false;
  }

  const fromName = process.env.SMTP_FROM_NAME || "下歌吧";
  const fromEmail = process.env.SMTP_FROM || "noreply@example.com";

  try {
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
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

  const typeLabel = typeLabels[feedbackType] || feedbackType;
  const siteHost = process.env.SITE_HOST || "";
  const musicUrl = siteHost ? `${siteHost.replace(/\/$/, "")}/music/${musicId}` : "";

  const subject = `您反馈的问题已处理 - ${musicTitle}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">您好！</h2>
      <p style="color: #666; line-height: 1.6;">
        您反馈的问题已得到处理，感谢您的耐心等待。
      </p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>歌曲：</strong>${musicTitle}</p>
        <p style="margin: 0 0 10px 0;"><strong>歌手：</strong>${musicArtist}</p>
        <p style="margin: 0 0 10px 0;"><strong>反馈类型：</strong>${typeLabel}</p>
        <p style="margin: 0;"><strong>处理状态：</strong><span style="color: #22c55e;">已处理</span></p>
      </div>
      ${musicUrl ? `
      <p style="color: #666; line-height: 1.6;">
        点击下方链接查看歌曲详情：
      </p>
      <p style="margin: 10px 0 20px 0;">
        <a href="${musicUrl}" style="color: #6366f1; text-decoration: none; word-break: break-all;">${musicUrl}</a>
      </p>
      ` : ""}
      <p style="color: #666; line-height: 1.6;">
        如果您还有其他问题，欢迎继续向我们反馈。
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">
        此邮件由下歌吧系统自动发送，请勿回复。
      </p>
    </div>
  `;

  return sendEmail({ to: email, subject, html });
};
