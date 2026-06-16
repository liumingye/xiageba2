import { ref, onMounted, onUnmounted } from 'vue'

export const useBackHistory = () => {
  const hasBackHistory = ref(false)

  const updateHistory = () => {
    hasBackHistory.value = window.history.length > 1
  }

  onMounted(() => {
    updateHistory()
    window.addEventListener('popstate', updateHistory)
  })

  onUnmounted(() => {
    window.removeEventListener('popstate', updateHistory)
  })

  return { hasBackHistory }
}
