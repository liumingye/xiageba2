import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'

interface AdminStorage {
  username: string
  loggedIn: boolean
}

export const useAdminStore = defineStore('admin', () => {
  const adminStorage = useLocalStorage<AdminStorage>('admin', { username: '', loggedIn: false })

  const isLoggedIn = computed(() => adminStorage.value.loggedIn)
  const username = computed(() => adminStorage.value.username)

  const login = (user: string) => {
    adminStorage.value = { username: user, loggedIn: true }
  }

  const logout = () => {
    adminStorage.value = { username: '', loggedIn: false }
  }

  const checkLogin = () => {
    // useLocalStorage 已在初始化时读取
  }

  return {
    isLoggedIn,
    username,
    login,
    logout,
    checkLogin
  }
})
