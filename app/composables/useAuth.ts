import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'

const username = useLocalStorage('admin-username', '')
const token = useLocalStorage('admin-token', '')
const initialized = ref(false)

export const useAuth = () => {
  const isLoggedIn = computed(() => !!username.value && !!token.value)

  const checkLogin = () => {
    // useLocalStorage 已在初始化时读取
    initialized.value = true
  }

  const login = (user: string, t: string) => {
    username.value = user
    token.value = t
    initialized.value = true
  }

  const logout = () => {
    username.value = ''
    token.value = ''
    initialized.value = true
    document.cookie = 'admin-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure'
  }

  const getAuthHeaders = (): Record<string, string> => {
    if (token.value) {
      return { 'Authorization': `Bearer ${token.value}` }
    }
    return {}
  }

  if (!initialized.value) {
    checkLogin()
  }

  return {
    isLoggedIn,
    username,
    token,
    login,
    logout,
    checkLogin,
    getAuthHeaders,
    initialized
  }
}
