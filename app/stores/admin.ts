import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAdminStore = defineStore('admin', () => {
  const isLoggedIn = ref(false)
  const username = ref('')
  
  const login = (user: string) => {
    isLoggedIn.value = true
    username.value = user
    localStorage.setItem('admin', JSON.stringify({ username: user, loggedIn: true }))
  }
  
  const logout = () => {
    isLoggedIn.value = false
    username.value = ''
    localStorage.removeItem('admin')
  }
  
  const checkLogin = () => {
    const saved = localStorage.getItem('admin')
    if (saved) {
      const data = JSON.parse(saved)
      if (data.loggedIn && data.username) {
        isLoggedIn.value = true
        username.value = data.username
      }
    }
  }
  
  return {
    isLoggedIn,
    username,
    login,
    logout,
    checkLogin
  }
})
