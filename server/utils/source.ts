export const getStorageType = (url: string) => {
  url = url || "";
  if (url.includes("pan.quark.cn")) return "quark";
  if (url.includes("pan.baidu.com")) return "baidu";
  if (url.includes("pan.uc.cn") || url.includes("drive.uc.cn")) return "uc";
  if (url.includes("pan.xunlei.com")) return "xunlei";
  return "other";
};
// IP字符串转数字
function ipToNum(ip: string) {
  return ip.split(".").reduce((sum, part) => (sum << 8) + Number(part), 0);
}

// 数字转回IP字符串
function numToIp(num: number) {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join(".");
}

/**
 * 任意CIDR网段随机IP
 * @param {string} cidr "1.14.51.0/24"
 * @returns {string} 随机ip
 */
export function getRandomIp(cidr: string) {
  const [ipStr, maskStr] = cidr.split("/");
  if (!ipStr || !maskStr) throw new Error("CIDR格式错误");

  const mask = Number(maskStr);
  const ipNum = ipToNum(ipStr);
  const hostBits = 32 - mask;
  const hostMax = (1 << hostBits) - 1;
  // 随机主机位
  const randomHost = Math.floor(Math.random() * (hostMax + 1));
  const randomIpNum = ipNum | randomHost;
  return numToIp(randomIpNum);
}

export const getRandomUA = () => {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6904.90 Safari/537.36 Edg/134.0.3111.110",
    "Mozilla/5.0 (Windows NT 10.0; WOW64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6935.89 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.7086.90 Safari/537.36 Edg/132.0.3179.102",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6965.96 Safari/537.36 Edg/133.0.2961.108",
    "Mozilla/5.0 (Windows NT 10.0; WOW64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.7075.101 Safari/537.36 Edg/133.0.3254.108",
    "Mozilla/5.0 (Windows NT 10.0; WOW64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.7158.98 Safari/537.36 Edg/133.0.3239.107",
    "Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.7191.90 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.13.20 Safari/537.36 OPR/102.0.8.98",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.7118.90 Safari/537.36 Edg/134.0.3310.111",
    "Mozilla/5.0 (iPhone; CPU OS 17_1) AppleWebKit/605.1.15 Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Redmi K60) Chrome/119 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36 EdgA/136.0.0.0 Edg/143.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TapPC/2026.5.19-rel.5 Chrome/108.0.5359.215 Safari/537.36 Edg/147.0.0.0",
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)] || "";
};
