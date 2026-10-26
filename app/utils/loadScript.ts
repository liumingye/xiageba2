/**
 * 单例脚本加载器：同一 URL 只插入一次 <script>，失败可重试
 */
const scriptPromiseCache = new Map<string, Promise<void>>();

export function loadScriptOnce(url: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("脚本加载仅支持浏览器环境"));
  }

  const cached = scriptPromiseCache.get(url);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // 失败时移除缓存，允许下次重试
      scriptPromiseCache.delete(url);
      script.remove();
      reject(new Error(`脚本加载失败: ${url}`));
    };
    document.head.appendChild(script);
  });

  scriptPromiseCache.set(url, promise);
  return promise;
}
