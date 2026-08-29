<script setup lang="ts">
import { ref, watch, reactive, computed } from "vue";
import {
  X,
  Search,
  Check,
  CheckCircle,
  Loader2,
  Disc3,
  Music,
  User,
  FileText,
  Image as ImageIcon,
} from "@lucide/vue";
import { post } from "~/utils/request";
import { useScrollLock } from "@vueuse/core";

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

interface ExistingMusic {
  title?: string;
  artist?: string;
  album?: string;
  cover?: string;
  lyrics?: string;
}

type ScrapeField = "title" | "artist" | "album" | "cover" | "lyrics";

const props = defineProps<{
  show: boolean;
  initialKeyword?: string;
  existingMusic?: ExistingMusic;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (
    e: "select",
    data: Partial<ScrapeResult> & { __selectedFields: ScrapeField[] },
  ): void;
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
const errorMsg = ref("");
const isScrollLocked = useScrollLock(window);

const scrapeResult = ref<ScrapeResult | null>(null);
const isLoadingDetail = ref(false);

const selectedFields = reactive<Record<ScrapeField, boolean>>({
  title: true,
  artist: true,
  album: true,
  cover: true,
  lyrics: true,
});

const existing = computed<ExistingMusic>(() => props.existingMusic || {});
const ALL_FIELDS: ScrapeField[] = [
  "title",
  "artist",
  "album",
  "cover",
  "lyrics",
];
const FIELD_LABEL: Record<ScrapeField, string> = {
  title: "歌名",
  artist: "歌手",
  album: "专辑",
  cover: "封面",
  lyrics: "歌词",
};

watch(
  () => props.show,
  (show) => {
    if (show) {
      isScrollLocked.value = true;
      keyword.value = props.initialKeyword || "";
      results.value = [];
      scrapeResult.value = null;
      errorMsg.value = "";
      ALL_FIELDS.forEach((f) => {
        selectedFields[f] = true;
      });
    } else {
      isScrollLocked.value = false;
    }
  },
);

const handleSearch = async () => {
  const kw = keyword.value.trim();
  if (!kw) return;

  isSearching.value = true;
  errorMsg.value = "";
  scrapeResult.value = null;

  try {
    const data = await post("/api/admin/music/scrape", {
      action: "search",
      platform: selectedPlatform.value,
      keyword: kw,
    });
    results.value = data.results || [];
    if (results.value.length === 0) {
      errorMsg.value = "未找到相关歌曲，请尝试其他关键词";
    }
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.message || "网络错误，请检查网络连接";
  } finally {
    isSearching.value = false;
  }
};

const selectItem = async (item: SearchItem) => {
  scrapeResult.value = null;
  isLoadingDetail.value = true;
  errorMsg.value = "";

  try {
    const data = await post("/api/admin/music/scrape", {
      action: "detail",
      platform: selectedPlatform.value,
      sourceId: item.sourceId,
    });
    scrapeResult.value = data.result;
    selectDiffFields();
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.message || "网络错误，请检查网络连接";
  } finally {
    isLoadingDetail.value = false;
  }
};

const backToSearch = () => {
  scrapeResult.value = null;
};

const hasDiff = (field: ScrapeField): boolean => {
  if (!scrapeResult.value) return false;
  const norm = (v: any) =>
    v === null || v === undefined ? "" : String(v).trim();
  return (
    norm((scrapeResult.value as any)[field]) !==
    norm((existing.value as any)[field])
  );
};

const selectAllFields = () => {
  ALL_FIELDS.forEach((f) => {
    selectedFields[f] = true;
  });
};

const selectDiffFields = () => {
  ALL_FIELDS.forEach((f) => {
    selectedFields[f] = hasDiff(f);
  });
};

const unselectAllFields = () => {
  ALL_FIELDS.forEach((f) => {
    selectedFields[f] = false;
  });
};

const toggleField = (field: ScrapeField) => {
  selectedFields[field] = !selectedFields[field];
};

const anySelected = computed(() => ALL_FIELDS.some((f) => selectedFields[f]));

const confirmSelect = () => {
  if (!scrapeResult.value || !anySelected.value) return;

  const fields: ScrapeField[] = ALL_FIELDS.filter((f) => selectedFields[f]);
  const data: Partial<ScrapeResult> & { __selectedFields: ScrapeField[] } = {
    __selectedFields: fields,
  };
  fields.forEach((f) => {
    (data as any)[f] = (scrapeResult.value as any)[f];
  });
  emit("select", data);
};

const handleClose = () => {
  emit("close");
};

// -------------- FieldCompareRow sub-component via composable --------------
const FIELD_ICON: Record<ScrapeField, any> = {
  title: Music,
  artist: User,
  album: Disc3,
  cover: ImageIcon,
  lyrics: FileText,
};

const normVal = (v: any): string => {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim() || "（空）";
  return String(v);
};

const rowIcon = (f: ScrapeField) => FIELD_ICON[f] ?? FileText;

const coverSame = (cover: string) => {
  if (!cover || !existing.value?.cover) return false;
  return (
    cover.substring(cover.lastIndexOf("/") + 1) ===
    existing.value.cover.substring(existing.value.cover.lastIndexOf("/") + 1)
  );
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
          class="modal-content relative bg-color-100 rounded-3xl p-6 max-w-4xl w-full border border-color-400 max-h-[92vh] flex flex-col"
        >
          <button
            class="absolute top-4 right-4 p-2 opacity-80 hover:opacity-100 hover:bg-color-300 rounded-lg transition-all"
            @click="handleClose"
          >
            <X class="w-5 h-5" />
          </button>

          <h3 class="text-xl font-medium mb-4 flex items-center gap-2">
            <Search class="w-5 h-5 text-primary-500" />
            {{ scrapeResult ? "对比 & 选择更新字段" : "音乐刮削" }}
          </h3>

          <!-- ================= 第一阶段：搜索列表 ================= -->
          <template v-if="!scrapeResult">
            <div class="flex gap-2 mb-4">
              <button
                v-for="p in platforms"
                :key="p.value"
                class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors border"
                :class="
                  selectedPlatform === p.value
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-color-300 text-color-300 border-color-300 hover:border-color-400'
                "
                @click="
                  selectedPlatform = p.value;
                  results = [];
                "
              >
                {{ p.label }}
              </button>
            </div>

            <div class="flex gap-2 mb-4">
              <input
                v-model="keyword"
                type="text"
                :placeholder="`输入歌名或歌手（当前：${platforms.find((p) => p.value === selectedPlatform)?.label}）`"
                class="flex-1 bg-color-300 border border-color-300 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
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
                class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors bg-color-300 border border-transparent"
                :class="
                  isLoadingDetail &&
                  scrapeResult === null &&
                  results[0]?.sourceId
                    ? 'pointer-events-none'
                    : 'hover:border-primary-500'
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
                  <p
                    class="text-sm font-medium truncate"
                    :class="[
                      item.title === existingMusic?.title
                        ? 'text-orange-500'
                        : '',
                    ]"
                  >
                    {{ item.title }}
                  </p>
                  <p
                    class="text-xs truncate"
                    :class="[
                      item.artist === existingMusic?.artist
                        ? 'text-orange-400'
                        : 'text-color-400',
                    ]"
                  >
                    {{ item.artist }}
                  </p>
                  <p
                    v-if="item.album"
                    class="text-xs truncate"
                    :class="[
                      item.album === existingMusic?.album
                        ? 'text-orange-400'
                        : 'text-color-500',
                    ]"
                  >
                    {{ item.album }}
                  </p>
                  <p
                    v-if="coverSame(item.cover)"
                    class="text-orange-400 text-xs truncate"
                  >
                    {{ item.cover }}
                  </p>
                </div>
              </div>
            </div>
          </template>

          <!-- ================= 第二阶段：对比 + 勾选 ================= -->
          <template v-else>
            <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <button
                v-if="isLoadingDetail"
                class="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-sm cursor-wait"
                disabled
              >
                <Loader2 class="w-4 h-4 animate-spin" />
                加载详情中...
              </button>
              <button
                v-else
                class="inline-flex items-center gap-2 px-3 py-1.5 bg-color-300 hover:bg-color-400 rounded-lg text-sm transition-colors"
                @click="backToSearch"
              >
                ← 返回搜索列表
              </button>

              <div
                class="flex items-center gap-2 text-xs text-zinc-500 ml-auto"
              >
                <span
                  class="px-2 py-1 rounded bg-primary-500 text-white"
                >
                  {{
                    platforms.find(
                      (p) => scrapeResult && p.value === scrapeResult.source,
                    )?.label
                  }}
                </span>
              </div>
            </div>

            <div
              class="flex items-center justify-between mb-4 text-sm flex-wrap gap-3"
            >
              <div class="text-zinc-400">
                勾选需要更新的字段，点击确认后仅更新勾选的内容
              </div>
              <div class="flex items-center gap-3">
                <button
                  class="text-primary-400 hover:text-primary-300"
                  @click="selectAllFields"
                >
                  全选
                </button>
                <span class="text-zinc-700">|</span>
                <button
                  class="text-color-500 hover:text-color-300"
                  @click="unselectAllFields"
                >
                  全不选
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
              <!-- 5 行对比：字段名 + 勾选 | 当前 | 刮削 -->
              <div
                v-for="field in ALL_FIELDS"
                :key="field"
                class="grid grid-cols-[1fr_1fr] sm:grid-cols-[44px_110px_1fr_1fr] gap-3 items-start p-3 rounded-xl border transition-colors cursor-pointer select-none"
                :class="
                  selectedFields[field]
                    ? 'bg-primary-500/10 border-primary-500/40'
                    : 'bg-color-300 border-color-300 hover:border-color-400'
                "
                @click="toggleField(field)"
              >
                <!-- 勾选框 -->
                <div class="flex items-center justify-center w-full h-8">
                  <div
                    class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0"
                    :class="
                      selectedFields[field]
                        ? 'bg-primary-500 border-primary-500'
                        : 'border-color-400'
                    "
                  >
                    <CheckCircle
                      v-if="selectedFields[field]"
                      class="w-4 h-4 text-white"
                    />
                  </div>
                </div>

                <!-- 字段名 -->
                <div
                  class="mt-1 flex items-center gap-1.5 text-color-300 flex-shrink-0"
                >
                  <component
                    :is="rowIcon(field)"
                    class="w-4 h-4 flex-shrink-0"
                  />
                  <span>{{ FIELD_LABEL[field] }}</span>
                  <span
                    v-if="hasDiff(field)"
                    class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-green-500 text-white flex-shrink-0"
                    >变</span
                  >
                </div>

                <!-- 当前值 -->
                <div
                  class="min-w-0 rounded-lg bg-color-300 px-3 py-2 text-xs text-color-300"
                  :class="{ 'max-h-40 overflow-y-auto': field === 'lyrics' }"
                >
                  <div class="text-[10px] uppercase tracking-wider mb-1">
                    当前
                  </div>
                  <!-- 封面 -->
                  <template v-if="field === 'cover'">
                    <img
                      v-if="(existing as any)[field]"
                      :src="(existing as any)[field]"
                      class="w-16 h-16 rounded object-cover"
                      @error="
                        ($event.target as HTMLImageElement).src =
                          '/img/cover.png'
                      "
                    />
                    <div
                      v-else
                      class="w-16 h-16 rounded bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs"
                    >
                      无
                    </div>
                  </template>
                  <!-- 其他文本 -->
                  <template v-else>
                    <div
                      :class="{
                        'break-words whitespace-pre-wrap': true,
                        'font-mono': field === 'lyrics',
                      }"
                    >
                      {{ normVal((existing as any)[field]) }}
                    </div>
                  </template>
                </div>

                <!-- 新值 -->
                <div
                  class="min-w-0 rounded-lg bg-color-300 px-3 py-2 text-xs"
                  :class="[{ 'max-h-40 overflow-y-auto': field === 'lyrics' }]"
                >
                  <div
                    class="text-[10px] uppercase tracking-wider mb-1"
                    :class="
                      hasDiff(field) ? 'text-primary-400' : 'text-color-300'
                    "
                  >
                    刮削
                  </div>
                  <template v-if="field === 'cover'">
                    <img
                      v-if="(scrapeResult as any)[field]"
                      :src="(scrapeResult as any)[field]"
                      class="w-16 h-16 rounded object-cover"
                      @error="
                        ($event.target as HTMLImageElement).src =
                          '/img/cover.png'
                      "
                    />
                    <div
                      v-else
                      class="w-16 h-16 rounded bg-color-400 flex items-center justify-center text-color-300 text-xs"
                    >
                      无
                    </div>
                  </template>
                  <template v-else>
                    <div
                      :class="{
                        'break-words whitespace-pre-wrap': true,
                        'font-mono': field === 'lyrics',
                      }"
                    >
                      {{ normVal((scrapeResult as any)[field]) }}
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- 底部按钮 -->
            <div
              class="mt-5 flex items-center justify-end gap-3 border-t border-color-300 pt-4"
            >
              <button
                class="px-4 py-2 bg-color-300 hover:bg-color-400 rounded-lg text-sm transition-colors"
                @click="backToSearch"
              >
                返回
              </button>
              <button
                class="flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!anySelected || isLoadingDetail"
                @click="confirmSelect"
              >
                <Check class="w-4 h-4" />
                确认更新（{{
                  ALL_FIELDS.filter((f) => selectedFields[f]).length
                }}
                项）
              </button>
            </div>
          </template>
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
