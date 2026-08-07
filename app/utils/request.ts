import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

/**
 * 后台管理专用 axios 实例
 * - 请求拦截器：自动注入 Bearer Token（从 localStorage 读取）
 * - 响应拦截器：统一处理 401（清除登录态并跳转登录页）
 */
let redirecting = false;

const instance: AxiosInstance = axios.create({
  baseURL: "/",
  timeout: 30000,
});

// 请求拦截器：注入鉴权头
instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("admin-token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器：统一 401 处理
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      // 清除登录态
      localStorage.removeItem("admin-username");
      localStorage.removeItem("admin-token");
      // 避免重复跳转
      if (!redirecting) {
        redirecting = true;
        // 使用 location 跳转，避免依赖 vue-router（拦截器中无法直接访问 router 实例）
        const current = window.location.pathname + window.location.search;
        if (!current.startsWith("/admin/login")) {
          window.location.href = `/admin/login?redirect=${encodeURIComponent(current)}`;
        }
        setTimeout(() => {
          redirecting = false;
        }, 1000);
      }
    }
    return Promise.reject(error);
  },
);

/**
 * 统一请求方法，返回 data 部分
 * 自动处理 401，调用方无需再写 `if (res.status === 401)` 逻辑
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
