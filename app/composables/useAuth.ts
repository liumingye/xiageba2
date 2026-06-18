import { ref } from 'vue'

const isLoggedIn = ref(false)
const username = ref('')
const token = ref('')
const initialized = ref(false)

export const useAuth = () => {
  const checkLogin = () => {
    if (typeof window === 'undefined') return
    
    const savedUsername = localStorage.getItem('admin-username')
    const savedToken = localStorage.getItem('admin-token')
    
    if (savedUsername && savedToken) {
      isLoggedIn.value = true
      username.value = savedUsername
      token.value = savedToken
    }
    initialized.value = true
  }

  const login = (user: string, t: string) => {
    isLoggedIn.value = true
    username.value = user
    token.value = t
    localStorage.setItem('admin-username', user)
    localStorage.setItem('admin-token', t)
  }

  const logout = () => {
    isLoggedIn.value = false
    username.value = ''
    token.value = ''
    localStorage.removeItem('admin-username')
    localStorage.removeItem('admin-token')
    document.cookie = 'admin-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure'
  }

  const getAuthHeaders = (): Record<string, string> => {
    if (token.value) {
      return { 'Authorization': `Bearer ${token.value}` }
    }
    return {}
  }

  if (!initialized.value && typeof window !== 'undefined') {
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
