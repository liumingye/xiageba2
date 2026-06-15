<script setup lang="ts">
import SearchBar from '~/components/SearchBar.vue'
import type { Music } from '~/stores/music'

const router = useRouter()
const musicStore = useMusicStore()

interface PaginatedResponse {
  data: Music[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const { data: pageData } = await useAsyncData('home-music', () => {
  return $fetch<PaginatedResponse>('/api/music?pageSize=9')
}, {
  server: true,
  lazy: false
})

const hotMusic = computed(() => pageData.value?.data || [])

useHead({
  title: '泡椒音乐 - 免费下载高品质MP3与FLAC无损音乐',
  meta: [
    { name: 'description', content: '泡椒音乐是一个免费高品质音乐下载平台，提供MP3与FLAC无损音乐下载、在线试听、歌词展示等功能。' },
    { name: 'keywords', content: '泡椒音乐, 音乐下载, FLAC, MP3, 无损音乐, 免费下载, 在线试听, 歌词' },
    { name: 'robots', content: 'index, follow' },
    { name: 'author', content: '泡椒音乐' },
    { name: 'theme-color', content: '#0f172a' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: '泡椒音乐 - 免费下载高品质MP3与FLAC无损音乐' },
    { property: 'og:description', content: '泡椒音乐是一个免费高品质音乐下载平台，提供MP3与FLAC无损音乐下载、在线试听、歌词展示等功能。' },
    { property: 'og:site_name', content: '泡椒音乐' },
    { property: 'og:url', content: '/' },
    { property: 'og:image', content: '/og-image.png' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: '泡椒音乐 - 免费下载高品质音乐' },
    { name: 'twitter:description', content: '免费高品质音乐下载，MP3与FLAC无损格式。' }
  ],
  link: [
    { rel: 'canonical', href: '/' },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
  ]
})

onMounted(() => {
  musicStore.loadSearchHistory()
})

const goToDetail = (music: Music) => {
  musicStore.setCurrentMusic(music)
  router.push(`/music/${music.id}`)
}

const searchFromHistory = (keyword: string) => {
  musicStore.addSearchHistory(keyword)
  router.push(`/search?q=${encodeURIComponent(keyword)}`)
}

const clearHistory = () => {
  musicStore.clearSearchHistory()
}
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-8 px-4">
    <div class="max-w-4xl mx-auto">
      <header class="text-center mb-12">
        <div class="flex items-center justify-center gap-3 mb-6">
          <div class="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-7 h-7 text-white" aria-hidden="true">
              <path fill="currentColor" d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" fill="currentColor" />
              <circle cx="18" cy="16" r="3" fill="currentColor" />
            </svg>
          </div>
          <h1 class="text-4xl font-bold text-white">泡椒音乐</h1>
        </div>
        <SearchBar />
      </header>

      <section v-if="musicStore.searchHistory.length > 0" class="mb-8" aria-labelledby="history-title">
        <h2 id="history-title" class="text-lg font-medium text-gray-300 mb-4">搜索历史</h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="keyword in musicStore.searchHistory"
            :key="keyword"
            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full text-sm transition-colors"
            @click="searchFromHistory(keyword)"
          >
            {{ keyword }}
          </button>
          <button
            class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors ml-2"
            @click="clearHistory"
            aria-label="清空搜索历史"
          >
            清空
          </button>
        </div>
      </section>

      <section aria-labelledby="hot-title">
        <h2 id="hot-title" class="text-lg font-medium text-gray-300 mb-4">最新音乐</h2>
        <div v-if="!hotMusic || hotMusic.length === 0" class="text-center py-12">
          <p class="text-gray-500">暂无最新音乐</p>
          <p class="text-gray-600 text-sm mt-2">请通过管理员后台添加音乐</p>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <article
            v-for="music in hotMusic"
            :key="music.id"
            class="card p-4 cursor-pointer hover:border-primary-500/50 transition-colors"
            @click="goToDetail(music)"
            role="article"
            :aria-label="music.title"
          >
            <div class="flex gap-4">
              <img
                :src="music.cover || 'https://via.placeholder.com/100'"
                :alt="music.title"
                class="w-20 h-20 rounded-lg object-cover"
                loading="lazy"
              />
              <div class="flex-1 flex flex-col justify-between py-1">
                <div>
                  <h3 class="font-medium text-white truncate">{{ music.title }}</h3>
                  <p class="text-sm text-gray-500 truncate">{{ music.artist }}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5 text-gray-500 self-end" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
            </div>
          </article>
        </div>
      </section>

      <footer class="mt-8 text-center">
        <p class="text-sm text-gray-600">
          &copy; {{ new Date().getFullYear() }} 泡椒音乐 - 免费音乐下载平台
        </p>
        <a
          href="/admin/login"
          class="text-sm text-gray-600 hover:text-gray-400 transition-colors mt-2 inline-block"
        >
          管理员登录
        </a>
      </footer>
    </div>
  </div>
</template>
