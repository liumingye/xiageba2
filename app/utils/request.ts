import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  clearAuthStorage,
  isAccessTokenStale,
  readAccessToken,
  readRefreshToken,
  storeAuthTokens,
} from "~/utils/authStorage";

/**
 * 后台管理专用 axios 实例
 *
 * 双 token 无感刷新：
 * - 请求前：access token 剩余不足 5 分钟就先续期，正常情况永远不撞 401
 * - 401 时：用 refreshToken 换新令牌并把原请求重放一次
 * - refresh 也失效：清登录态跳登录页
 *
 * 并发安全：多个请求同时 401 只会发一次刷新请求，其余等同一个 Promise。
 */
let redirecting = false;

/** 主动续期提前量：access token 1 小时，提前 5 分钟换 */
const REFRESH_AHEAD_MS = 5 * 60 * 1000;

const instance: AxiosInstance = axios.create({
  baseURL: "/",
  timeout: 30000,
});

/** 登录 / 刷新本身不能再触发刷新，否则会递归 */
const isAuthEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return (
    url.includes("/api/admin/login") || url.includes("/api/admin/refresh")
  );
};

/** 单飞：同一时刻只允许一个刷新请求 */
let refreshPromise: Promise<string> | null = null;

async function requestNewAccessToken(): Promise<string> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) throw new Error("NO_REFRESH_TOKEN");

  // 用裸 axios，避免走下面这套拦截器
  const res = await axios.post(
    "/api/admin/refresh",
    { refreshToken },
    {
      timeout: 15000,
      headers: { "Content-Type": "application/json" },
    },
  );

  const data = res.data ?? {};
  if (!data || typeof data.accessToken !== "string" || !data.accessToken) {
    throw new Error("BAD_REFRESH_RESPONSE");
  }

  storeAuthTokens({
    accessToken: data.accessToken,
    refreshToken:
      typeof data.refreshToken === "string" && data.refreshToken
        ? data.refreshToken
        : refreshToken,
    expiresIn: typeof data.expiresIn === "number" ? data.expiresIn : undefined,
    refreshExpiresIn:
      typeof data.refreshExpiresIn === "number"
        ? data.refreshExpiresIn
        : undefined,
  });

  return data.accessToken;
}

function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  const pending = requestNewAccessToken().finally(() => {
    if (refreshPromise === pending) refreshPromise = null;
  });
  refreshPromise = pending;
  return pending;
}

/** 清登录态并跳登录页（带当前路径，登录后能回来） */
function redirectToLogin(): void {
  clearAuthStorage();
  if (redirecting) return;
  redirecting = true;
  const current = window.location.pathname + window.location.search;
  if (!current.startsWith("/admin/login")) {
    window.location.href = `/admin/login?redirect=${encodeURIComponent(current)}`;
  }
  setTimeout(() => {
    redirecting = false;
  }, 1000);
}

// 请求拦截器：能续就续，然后注入鉴权头
instance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (!isAuthEndpoint(config.url) && isAccessTokenStale(REFRESH_AHEAD_MS)) {
      try {
        await refreshAccessToken();
      } catch {
        // 续期失败不在这里处理，让请求打到 401 再统一处置
      }
    }

    const token = readAccessToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// 响应拦截器：401 → 刷新 → 重放一次
instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const original = error?.config as RetriableConfig | undefined;

    if (status !== 401 || !original || isAuthEndpoint(original.url)) {
      return Promise.reject(error);
    }

    // 已经重放过一次还 401，说明新令牌也不好使，直接踢回登录
    if (original._retry) {
      redirectToLogin();
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      const token = await refreshAccessToken();
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${token}`;
      return instance.request(original);
    } catch (refreshError: any) {
      const refreshStatus = refreshError?.response?.status;
      const isRefreshRejected =
        refreshError?.message === "NO_REFRESH_TOKEN" ||
        (typeof refreshStatus === "number" &&
          refreshStatus >= 400 &&
          refreshStatus < 500);

      // 网络抖动不登出：可能是临时断网，下次请求还会再试
      if (isRefreshRejected) redirectToLogin();
      return Promise.reject(error);
    }
  },
);

/**
 * 统一请求方法，返回 data 部分
 * 自动处理 401 与令牌续期，调用方无需再写 `if (res.status === 401)` 逻辑
 */
export async function request<T = any>(
  config: AxiosRequestConfig,
): Promise<T> {
  const res = await instance.request<T>(config);
  return res.data;
}

/** GET 请求快捷方法 */
export function get<T = any>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  return request<T>({ ...config, method: "GET", url });
}

/** POST 请求快捷方法 */
export function post<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig,
): Promise<T> {
  return request<T>({ ...config, method: "POST", url, data });
}

/** PUT 请求快捷方法 */
export function put<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig,
): Promise<T> {
  return request<T>({ ...config, method: "PUT", url, data });
}

/** DELETE 请求快捷方法 */
export function del<T = any>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  return request<T>({ ...config, method: "DELETE", url });
}

/** PATCH 请求快捷方法 */
export function patch<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig,
): Promise<T> {
  return request<T>({ ...config, method: "PATCH", url, data });
}

export default instance;
