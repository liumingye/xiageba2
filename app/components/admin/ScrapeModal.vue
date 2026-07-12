<script setup lang="ts">
import { ref, watch } from "vue";
import { X, Search, ExternalLink, CheckCircle, Loader2 } from "@lucide/vue";

interface SearchItem {
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
}

interface ScrapeResult {
  source: "kuwo" | "qq" | "netease";
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  lyrics?: string;
  downloads: Array<{ quality: string; url: string }>;
}

const { getAuthHeaders } = useAuth();

const props = defineProps<{
  show: boolean;
  initialKeyword?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", data: ScrapeResult): void;
}>();

const platforms = [
  { value: "kuwo", label: "酷我音乐" },
  { value: "qq", label: "QQ音乐" },
  { value: "netease", label: "网易云音乐" },
];

const selectedPlatform = ref("kuwo");
const keyword = ref("");
const results = ref<SearchItem[]>([]);
const isSearching = ref(false);
const selectedItem = ref<SearchItem | null>(null);
const isLoadingDetail = ref(false);
const errorMsg = ref("");

watch(
  () => props.show,
  (show) => {
    if (show) {
      keyword.value = props.initialKeyword || "";
      results.value = [];
      selectedItem.value = null;
      errorMsg.value = "";
    }
  },
);

const handleSearch = async () => {
  const kw = keyword.value.trim();
  if (!kw) return;

  isSearching.value = true;
  errorMsg.value = "";
  selectedItem.value = null;

  try {
    const res = await fetch("/api/admin/music/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        action: "search",
        platform: selectedPlatform.value,
        keyword: kw,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      errorMsg.value = data.message || "搜索失败";
      return;
    }

    const data = await res.json();
    results.value = data.results || [];
    if (results.value.length === 0) {
      errorMsg.value = "未找到相关歌曲，请尝试其他关键词";
    }
  } catch {
    errorMsg.value = "网络错误，请检查网络连接";
  } finally {
    isSearching.value = false;
  }
};

const selectItem = async (item: SearchItem) => {
  selectedItem.value = item;
  isLoadingDetail.value = true;
  errorMsg.value = "";

  try {
    const res = await fetch("/api/admin/music/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        action: "detail",
        platform: selectedPlatform.value,
        sourceId: item.sourceId,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      errorMsg.value = data.message || "获取详情失败";
      selectedItem.value = null;
      return;
    }

    const data = await res.json();
    emit("select", data.result);
  } catch {
    errorMsg.value = "网络错误，请检查网络连接";
    selectedItem.value = null;
  } finally {
    isLoadingDetail.value = false;
  }
};

const handleClose = () => {
  emit("close");
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="handleClose"
        ></div>

        <div
          class="modal-content relative bg-gray-900 rounded-3xl p-6 max-w-lg w-full border border-gray-800 max-h-[85vh] flex flex-col"
        >
          <button
            class="absolute top-4 right-4 p-2 hover:bg-gray-800 rounded-lg transition-colors"
            @click="handleClose"
          >
            <X class="w-5 h-5 text-gray-400" />
          </button>

          <h3
            class="text-xl font-medium text-white mb-4 flex items-center gap-2"
          >
            <Search class="w-5 h-5 text-primary-500" />
            音乐刮削
          </h3>

          <!-- 平台选择 -->
          <div class="flex gap-2 mb-4">
            <button
              v-for="p in platforms"
              :key="p.value"
              class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors border"
              :class="
                selectedPlatform === p.value
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
              "
              @click="
                selectedPlatform = p.value;
                results = [];
                selectedItem = null;
              "
            >
              {{ p.label }}
            </button>
          </div>

          <!-- 搜索框 -->
          <div class="flex gap-2 mb-4">
            <input
              v-model="keyword"
              type="text"
              :placeholder="`输入歌名或歌手（当前：${platforms.find((p) => p.value === selectedPlatform)?.label}）`"
              class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
              @keydown.enter="handleSearch"
            />
            <button
              class="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
              :disabled="isSearching || !keyword.trim()"
              @click="handleSearch"
            >
              <Loader2 v-if="isSearching" class="w-4 h-4 animate-spin" />
              <Search v-else class="w-4 h-4" />
              {{ isSearching ? "搜索中..." : "搜索" }}
            </button>
          </div>

          <p v-if="errorMsg" class="text-red-400 text-sm mb-3">
            {{ errorMsg }}
          </p>

          <!-- 搜索结果 -->
          <div class="flex-1 overflow-y-auto space-y-2 min-h-0">
            <div
              v-if="results.length === 0 && !errorMsg && !isSearching"
              class="text-center py-8 text-gray-500 text-sm"
            >
              选择平台并输入关键词搜索
            </div>

            <div
              v-for="item in results"
              :key="item.sourceId"
              class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
              :class="
                selectedItem?.sourceId === item.sourceId
                  ? 'bg-primary-500/20 border border-primary-500/50'
                  : 'bg-gray-800 hover:bg-gray-750 border border-transparent'
              "
              @click="selectItem(item)"
            >
              <img
                :src="item.cover || '/img/cover.png'"
                :alt="item.title"
                class="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                loading="lazy"
                @error="
                  ($event.target as HTMLImageElement).src = '/img/cover.png'
                "
              />
              <div class="flex-1 min-w-0">
                <p class="text-white text-sm font-medium truncate">
                  {{ item.title }}
                </p>
                <p class="text-gray-400 text-xs truncate">{{ item.artist }}</p>
                <p v-if="item.album" class="text-gray-500 text-xs truncate">
                  {{ item.album }}
                </p>
              </div>
              <div
                v-if="selectedItem?.sourceId === item.sourceId"
                class="flex-shrink-0"
              >
                <Loader2
                  v-if="isLoadingDetail"
                  class="w-5 h-5 text-primary-400 animate-spin"
                />
                <CheckCircle v-else class="w-5 h-5 text-primary-400" />
              </div>
            </div>
          </div>

          <div class="mt-3 text-xs text-gray-600 text-center">
            刮削结果可能不完整，请核对后保存
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-leave-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.modal-content {
  will-change: opacity, transform;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(-8px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.985) translateY(0);
}
</style>
