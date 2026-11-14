import { computed, ref } from "vue";
import {
  AUTH_STORAGE_KEYS,
  clearAuthStorage,
  readAuthSnapshot,
  storeAuthTokens,
  subscribeAuthTokens,
  type StoreTokensInput,
} from "~/utils/authStorage";

/**
 * 后台登录态
 *
 * 双 token 模型：
 * - accessToken 短（1 小时），放请求头，过期后由 axios 拦截器拿 refreshToken 换新的
 * - refreshToken 长（7 天），只用于 /api/admin/refresh，不参与业务接口鉴权
 *
 * 状态直接从 localStorage 读一次并常驻 ref；令牌刷新在 app/utils/request.ts 里发生，
 * 通过 subscribeAuthTokens 回写这里，保证多标签/多入口看到的是同一份状态。
 */
const initial = readAuthSnapshot();

const username = ref(initial.username);
const accessToken = ref(initial.accessToken);
const refreshToken = ref(initial.refreshToken);
const accessExp = ref(initial.accessExp);
const refreshExp = ref(initial.refreshExp);
const initialized = ref(true);

subscribeAuthTokens((snapshot) => {
  username.value = snapshot?.username ?? "";
  accessToken.value = snapshot?.accessToken ?? "";
  refreshToken.value = snapshot?.refreshToken ?? "";
  accessExp.value = snapshot?.accessExp ?? 0;
  refreshExp.value = snapshot?.refreshExp ?? 0;
});

/** access token 仍在自己声明的时间窗内 */
const hasLiveAccessToken = computed(() => {
  if (!accessToken.value) return false;
  if (!accessExp.value) return true;
  return accessExp.value > Date.now();
});

/** refresh token 仍在自己声明的时间窗内 */
const hasLiveRefreshToken = computed(() => {
  if (!refreshToken.value) return false;
  if (!refreshExp.value) return true;
  return refreshExp.value > Date.now();
});

/**
 * 是否处于登录态
 * access 过期但 refresh 还活着也算登录 —— 首个请求会自动续期，不该提前踢人
 */
const isLoggedIn = computed(
  () =>
    !!username.value && (hasLiveAccessToken.value || hasLiveRefreshToken.value),
);

export const useAuth = () => {
  const checkLogin = () => {
    const snapshot = readAuthSnapshot();
    username.value = snapshot.username;
    accessToken.value = snapshot.accessToken;
    refreshToken.value = snapshot.refreshToken;
    accessExp.value = snapshot.accessExp;
    refreshExp.value = snapshot.refreshExp;
    initialized.value = true;
  };

  const login = (user: string, tokens: StoreTokensInput) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          AUTH_STORAGE_KEYS.username,
          JSON.stringify(user),
        );
      } catch {
        // 隐私模式下写入失败不影响内存态
      }
    }
    storeAuthTokens(tokens);
    // storeAuthTokens 会 emit 一次快照，这里最后兜一次，确保用户名一定落到内存态
    username.value = user;
    initialized.value = true;
  };

  const logout = () => {
    clearAuthStorage();
    initialized.value = true;
  };

  const getAuthHeaders = (): Record<string, string> => {
    if (accessToken.value) {
      return { Authorization: `Bearer ${accessToken.value}` };
    }
    return {};
  };

  return {
    isLoggedIn,
    username,
    accessToken,
    refreshToken,
    login,
    logout,
    checkLogin,
    getAuthHeaders,
    initialized,
  };
};
