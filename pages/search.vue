<script setup lang="ts">
import SearchBar from '~/components/SearchBar.vue'
import type { Music } from '~/stores/music'

interface PaginatedResponse {
  data: Music[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const route = useRoute()
const router = useRouter()
const musicStore = useMusicStore()

const searchQuery = ref('')
const currentPage = computed(() => Math.max(1, parseInt(route.query.page as string) || 1))
const searchKeyword = computed(() => (route.query.q as string) || '')

const { data: pageData } = await useAsyncData(
  () => `search-${searchKeyword.value}-${currentPage.value}`,
  async () => {
    const q = searchKeyword.value
    if (!q) return null
    return await $fetch<PaginatedResponse>(`/api/music?search=${encodeURIComponent(q)}&page=${currentPage.value}&pageSize=10`)
  },
  {
    server: true,
    lazy: false,
    watch: [searchKeyword, currentPage]
  }
)

const results = computed(() => pageData.value?.data || [])
const total = computed(() => pageData.value?.total || 0)
const totalPages = computed(() => pageData.value?.totalPages || 0)
const pageSize = 10

const pageTitle = computed(() => {
  const q = searchKeyword.value
  if (q && results.value.length > 0) {
    return `"${q}" - 第${currentPage.value}页 - 搜索结果 - 下歌吧`
  }
  if (q) {
    return `${q} - 搜索 - 下歌吧`
  }
  return '搜索 - 下歌吧'
})

const pageDescription = computed(() => {
  const q = searchKeyword.value
  if (q && total.value > 0) {
    return `在下歌吧搜索"${q}"，共找到 ${total.value} 首相关歌曲，免费下载高品质MP3与FLAC无损音乐。`
  }
  if (q) {
    return `在下歌吧搜索"${q}"的相关结果。`
  }
  return '下歌吧搜索 - 免费下载高品质音乐。'
})

useHead({
  title: pageTitle,
  meta: [
    { name: 'description', content: pageDescription },
    { name: 'keywords', content: `${searchKeyword.value}, 音乐搜索, 下歌吧, MP3下载, FLAC下载` },
    { name: 'robots', content: 'index, follow' },
    { name: 'theme-color', content: '#0f172a' },
    { property: 'og:title', content: pageTitle },
    { property: 'og:description', content: pageDescription },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: '下歌吧' }
  ],
  link: [
    { rel: 'canonical', href: () => `/search?q=${encodeURIComponent(searchKeyword.value)}&page=${currentPage.value}` },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
  ]
})

onMounted(() => {
  searchQuery.value = searchKeyword.value
})

watch(searchKeyword, (val) => {
  searchQuery.value = val
})

const performSearch = () => {
  if (!searchQuery.value.trim()) return
  musicStore.addSearchHistory(searchQuery.value)
  router.push(`/search?q=${encodeURIComponent(searchQuery.value)}`)
}

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return
  router.push({
    path: '/search',
    query: {
      q: searchKeyword.value,
      page: page.toString()
    }
  })
}

const getPageNumbers = (): (number | '...')[] => {
  const pages: (number | '...')[] = []
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
    return pages
  }
  pages.push(1)
  if (current > 3) pages.push('...')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

const goBack = () => {
  router.back()
}

const goToDetail = (music: Music) => {
  musicStore.setCurrentMusic(music)
  router.push(`/music/${music.id}`)
}
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-6 px-4">
    <div class="max-w-4xl mx-auto">
      <nav class="flex items-center gap-4 mb-6">
        <button
          class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          @click="goBack"
          aria-label="返回"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5 text-gray-400" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <SearchBar v-model="searchQuery" @search="performSearch" />
      </nav>

      <main>
        <div v-if="searchKeyword && results.length > 0" class="space-y-3">
          <h2 class="text-gray-500 text-sm">
            搜索"<span class="text-primary-400">{{ searchKeyword }}</span>"找到 {{ total }} 首歌曲
            <span v-if="totalPages > 1" class="ml-2">（第 {{ currentPage }} / {{ totalPages }} 页）</span>
          </h2>

          <article
            v-for="music in results"
            :key="music.id"
            class="card p-4 cursor-pointer hover:border-primary-500/50 transition-colors"
            @click="goToDetail(music)"
            role="article"
          >
            <div class="flex items-center gap-4">
              <img
                :src="music.cover || 'https://via.placeholder.com/80'"
                :alt="music.title"
                class="w-16 h-16 rounded-lg object-cover"
                loading="lazy"
              />
              <div class="flex-1">
                <h3 class="font-medium text-white">{{ music.title }}</h3>
                <p class="text-sm text-gray-500">{{ music.artist }} - {{ music.album }}</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5 text-gray-600" aria-hidden="true">
                <path fill="currentColor" d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" fill="currentColor" />
                <circle cx="18" cy="16" r="3" fill="currentColor" />
              </svg>
            </div>
          </article>

          <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-8 flex-wrap" role="navigation" aria-label="分页">
            <button
              class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="currentPage <= 1"
              @click="goToPage(currentPage - 1)"
            >
              上一页
            </button>

            <template v-for="(pageNum, idx) in getPageNumbers()" :key="idx">
              <span v-if="pageNum === '...'" class="px-3 py-2 text-gray-500">...</span>
              <button
                v-else
                class="px-4 py-2 rounded-lg transition-colors"
                :class="pageNum === currentPage
                  ? 'bg-primary-500 text-white font-medium'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'"
                @click="goToPage(pageNum as number)"
                :aria-current="pageNum === currentPage ? 'page' : undefined"
              >
                {{ pageNum }}
              </button>
            </template>

            <button
              class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="currentPage >= totalPages"
              @click="goToPage(currentPage + 1)"
            >
              下一页
            </button>
          </div>
        </div>

        <div v-else-if="searchKeyword" class="text-center py-20">
          <div class="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-10 h-10 text-gray-600" aria-hidden="true">
              <path fill="currentColor" d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" fill="currentColor" />
              <circle cx="18" cy="16" r="3" fill="currentColor" />
            </svg>
          </div>
          <p class="text-gray-500">暂无搜索结果：{{ searchKeyword }}</p>
          <p class="text-gray-600 text-sm mt-2">请尝试其他关键词</p>
        </div>

        <div v-else class="text-center py-20">
          <p class="text-gray-500">请输入搜索关键词</p>
        </div>
      </main>
    </div>
  </div>
</template>
