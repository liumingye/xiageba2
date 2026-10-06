/**
 * 网盘分享链接净化
 *
 * 后台录入时粘贴的内容通常是一大段文字（标题 + 链接 + "提取码：xxxx"），
 * 这里负责把其中的分享链接抠出来，归一化为系统内部的标准格式：
 * - 统一 https
 * - 去掉无关参数
 * - 提取码统一收敛为 `?pwd=xxxx`（移动云盘例外，见下）
 *
 * 支持的网盘：百度（含 share/init）、夸克、UC、迅雷、光鸭、中国移动云盘。
 */

/** 通用提取码参数（光鸭用 code，其他盘用 pwd 系列） */
const CODE_PARAM_RE = /[?&](?:code|pwd|passcode|accessCode)=([a-zA-Z0-9]+)/i;

/**
 * 解析移动云盘最后一个 `&` 片段里的提取码
 *
 * 移动云盘把提取码挂在 hash 片段里：`/w/i/<linkId>&<码>`。
 * 该片段可能是：
 * - `&aaaa`        → 裸码，直接用
 * - `&pwd=aaaa`    → 带参数名，去掉 `xxx=` 前缀
 * - `&123agyn`     → 带前缀字符，取末尾 4 位字母数字
 * - `&test=aaaa`   → 混进来的无关参数，同样取末尾 4 位
 */
function parseC139Code(suffix: string): string {
  if (!suffix) return "";

  // 有 key=value 形式时，只取 = 后面的值
  const eq = suffix.lastIndexOf("=");
  const raw = eq === -1 ? suffix : suffix.slice(eq + 1);

  return raw.replace(/[^a-zA-Z0-9]/g, "").slice(-4);
}

/** 从文本中提取并净化网盘链接 */
export function purifyUrl(input: string): string {
  const text = input.trim();
  if (!text) return "";

  // =========================
  // 1. 百度 share/init
  // =========================
  const baiduInitMatch = text.match(
    /https?:\/\/pan\.baidu\.com\/share\/init\?surl=([a-zA-Z0-9_-]+)/i,
  );

  if (baiduInitMatch) {
    const surl = baiduInitMatch[1];

    // pwd 可以在 &pwd= 后面
    const pwdMatch = text.match(/[?&]pwd=([a-zA-Z0-9]{4})/i);

    const pwd = pwdMatch?.[1];

    return `https://pan.baidu.com/s/1${surl}${pwd ? `?pwd=${pwd}` : ""}`;
  }

  // =========================
  // 2. 中国移动云盘
  //    https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x
  //    https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&aaaa
  //    https://yun.139.com/shareweb/#/w/i/2xop65sqZtC7x&pwd=aaaa
  //    https://caiyun.139.com/w/i/2w2KGS8UroDs4&1ben&test=aaaa
  //
  //    提取码位于 hash 片段内（不是 query），形如 /w/i/<linkId>&<码>，
  //    必须用 & 追加，写成 ?pwd= 会被解析进 linkId。
  //    以【最后一个 &】为界：前面原样保留，最后一段去掉 key= 后取末尾 4 位。
  // =========================
  const c139Token = text.match(
    /https?:\/\/[^\s]*yun\.139\.com\/[^\s]*/i,
  )?.[0];

  if (c139Token) {
    const marker = c139Token.search(/w\/i\//i);

    if (marker !== -1) {
      const head = c139Token.slice(0, marker + 4); // 含 "w/i/"
      // ? 之后是无关查询串（如 ?t=test），直接丢掉
      const tail = c139Token.slice(marker + 4).split("?")[0] || "";

      const amp = tail.lastIndexOf("&");
      const idPart = amp === -1 ? tail : tail.slice(0, amp);
      const code = parseC139Code(amp === -1 ? "" : tail.slice(amp + 1));

      return `${head}${idPart}${code ? `&${code}` : ""}`.replace(
        /^http:\/\//i,
        "https://",
      );
    }
  }

  // =========================
  // 3. 光鸭云盘
  //    https://www.guangyapan.com/s/1954483955528601683_ahbuQx891sNe7a8s
  //    https://www.guangyapan.com/s/1954483955528601683_ahbuQx891sNe7a8s?code=ldkk
  // =========================
  const guangyaMatch = text.match(
    /(https?:\/\/(?:www\.)?guangyapan\.com\/(?:s|share|link|download)\/[a-zA-Z0-9_-]+)/i,
  );

  if (guangyaMatch && guangyaMatch[1]) {
    const base = guangyaMatch[1].replace(/^http:\/\//i, "https://");
    const code = text.match(CODE_PARAM_RE)?.[1];

    return `${base}${code ? `?code=${code}` : ""}`;
  }

  // =========================
  // 4. 普通网盘分享链接
  // =========================
  const patterns = [
    // 百度
    /https?:\/\/pan\.baidu\.com\/s\/[a-zA-Z0-9_-]+/i,
    // 夸克
    /https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9_-]+/i,
    // UC
    /https?:\/\/(?:drive|fast)\.uc\.cn\/s\/[a-zA-Z0-9_-]+/i,
    // 迅雷
    /https?:\/\/pan\.xunlei\.com\/s\/[a-zA-Z0-9_-]+/i,
  ];

  let url: string | null = null;

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      url = match[0];
      break;
    }
  }

  // 没有匹配到已知网盘链接
  if (!url) {
    return text;
  }

  // =========================
  // 5. 提取 pwd
  // =========================

  const pwdMatch = text.match(/[?&]pwd=([a-zA-Z0-9]{4})/i);

  const pwd = pwdMatch?.[1];

  // =========================
  // 6. 重新拼接
  // =========================

  if (pwd) {
    url += `?pwd=${pwd}`;
  }

  // =========================
  // 7. 统一 HTTPS
  // =========================

  url = url.replace(/^http:\/\//i, "https://");

  return url;
}
