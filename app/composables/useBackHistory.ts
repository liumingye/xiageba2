import { ref, onMounted } from 'vue'
import { useEventListener } from '@vueuse/core'

export const useBackHistory = () => {
  const hasBackHistory = ref(false)

  const updateHistory = () => {
    hasBackHistory.value = window.history.length > 1
  }

  useEventListener(window, 'popstate', updateHistory)

  onMounted(() => {
    updateHistory()
  })

  return { hasBackHistory }
}
