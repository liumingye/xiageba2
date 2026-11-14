/**
 * 后台登录态的本地存储
 *
 * 统一 key 与读写口径：useAuth（响应式状态）和 axios 拦截器（令牌刷新）
 * 都从这里取，避免 key 字符串和 JSON 编码方式各写一份对不上。
 *
 * 值统一用 JSON.stringify 写入（旧版 useLocalStorage 也是这个格式），
 * 读取时对非 JSON 的裸字符串做兜底。
 */

export const AUTH_STORAGE_KEYS = {
  username: "admin-username",
  accessToken: "admin-access-token",
  refreshToken: "admin-refresh-token",
  /** access token 过期时间（毫秒时间戳） */
  accessExp: "admin-access-token-exp",
  /** refresh token 过期时间（毫秒时间戳） */
  refreshExp: "admin-refresh-token-exp",
} as const;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** access 过期毫秒时间戳，0 表示未知 */
  accessExp: number;
  /** refresh 过期毫秒时间戳，0 表示未知 */
  refreshExp: number;
}

export interface AuthSnapshot extends AuthTokens {
  username: string;
}

export interface StoreTokensInput {
  accessToken: string;
  refreshToken?: string;
  /** access 有效期（秒） */
  expiresIn?: number;
  /** refresh 剩余有效期（秒） */
  refreshExpiresIn?: number;
}

type TokensListener = (snapshot: AuthSnapshot | null) => void;

const listeners = new Set<TokensListener>();

/** 订阅令牌变化，返回取消订阅函数。传 null 表示登录态已清空。 */
export function subscribeAuthTokens(fn: TokensListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const emit = (snapshot: AuthSnapshot | null): void => {
  for (const fn of listeners) fn(snapshot);
};

const hasStorage = (): boolean =>
  typeof window !== "undefined" && !!window.localStorage;

const readRaw = (key: string): string | null => {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // 隐私模式下 localStorage 可能抛错
    return null;
  }
};

const readString = (key: string): string => {
  const raw = readRaw(key);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
  } catch {
    // 非 JSON（手写或历史格式），按原文处理
  }
  return raw;
};

const readNumber = (key: string): number => {
  const raw = readRaw(key);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const writeValue = (key: string, value: string | number): void => {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 配额满 / 隐私模式，静默忽略
  }
};

const removeValue = (key: string): void => {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export function readAuthSnapshot(): AuthSnapshot {
  return {
    username: readString(AUTH_STORAGE_KEYS.username),
    accessToken: readString(AUTH_STORAGE_KEYS.accessToken),
    refreshToken: readString(AUTH_STORAGE_KEYS.refreshToken),
    accessExp: readNumber(AUTH_STORAGE_KEYS.accessExp),
    refreshExp: readNumber(AUTH_STORAGE_KEYS.refreshExp),
  };
}

export function readAccessToken(): string {
  return readString(AUTH_STORAGE_KEYS.accessToken);
}

export function readRefreshToken(): string {
  return readString(AUTH_STORAGE_KEYS.refreshToken);
}

/** 写入令牌组，并通知订阅方（useAuth 的响应式状态） */
export function storeAuthTokens(input: StoreTokensInput): void {
  const now = Date.now();
  const accessExp =
    typeof input.expiresIn === "number" && input.expiresIn > 0
      ? now + input.expiresIn * 1000
      : 0;
  const refreshExp =
    typeof input.refreshExpiresIn === "number" && input.refreshExpiresIn > 0
      ? now + input.refreshExpiresIn * 1000
      : 0;

  writeValue(AUTH_STORAGE_KEYS.accessToken, input.accessToken);
  writeValue(AUTH_STORAGE_KEYS.accessExp, accessExp);

  if (typeof input.refreshToken === "string" && input.refreshToken) {
    writeValue(AUTH_STORAGE_KEYS.refreshToken, input.refreshToken);
    writeValue(AUTH_STORAGE_KEYS.refreshExp, refreshExp);
  }

  emit(readAuthSnapshot());
}

/** 清空登录态（含旧版遗留 key） */
export function clearAuthStorage(): void {
  removeValue(AUTH_STORAGE_KEYS.username);
  removeValue(AUTH_STORAGE_KEYS.accessToken);
  removeValue(AUTH_STORAGE_KEYS.refreshToken);
  removeValue(AUTH_STORAGE_KEYS.accessExp);
  removeValue(AUTH_STORAGE_KEYS.refreshExp);
  emit(null);
}

/** access token 是否即将过期（leewayMs 为提前量） */
export function isAccessTokenStale(leewayMs = 0): boolean {
  const exp = readNumber(AUTH_STORAGE_KEYS.accessExp);
  // 未知过期时间就不主动刷新，交给 401 兜底
  if (!exp) return false;
  return exp - leewayMs <= Date.now();
}

/** refresh token 是否还在有效期内（过期时间未知时按有效处理） */
export function hasLiveRefreshToken(): boolean {
  const refreshToken = readString(AUTH_STORAGE_KEYS.refreshToken);
  if (!refreshToken) return false;
  const exp = readNumber(AUTH_STORAGE_KEYS.refreshExp);
  if (!exp) return true;
  return exp > Date.now();
}
