/**
 * 从请求错误里取给用户看的提示语。
 *
 * 后端统一返回 `{ message }`，部分端点用 `{ error }`，而网络中断、超时、
 * 5xx 时根本拿不到响应体。调用方只关心"显示什么"，逐级兜底的事收在这里，
 * 免得每个 catch 里重复写一遍 `e?.response?.data?.message || "xx失败"`。
 *
 * 只做取值取值兜底，不改写后端给的文案——后端说了话就照说。
 */
export function getApiErrorMessage(e: unknown, fallback = "操作失败"): string {
  const data = (e as any)?.response?.data;
  const message = data?.message ?? data?.error;
  if (typeof message === "string" && message.trim()) {
    return message;
  }
  // 完全没有响应体：网络断开、超时、被拦截
  if (!(e as any)?.response) {
    return "网络错误，请检查连接后重试";
  }
  return fallback;
}
