<script setup lang="ts">
import {
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Megaphone,
  ChevronRight,
  X,
} from "@lucide/vue";

interface Announcement {
  id: string;
  title: string;
  content: string;
  displayType: "NORMAL" | "BANNER" | "DIALOG";
  icon: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  createdAt: string;
}

const { data } = await useFetch<{ data: Announcement[] }>("/api/announcement", {
  query: { pageSize: 3, displayType: "NORMAL" },
  server: true,
  default: () => ({ data: [] }),
});

const allAnnouncements = computed(() => data.value?.data || []);

const normalList = computed(() =>
  allAnnouncements.value.filter((a) => a.displayType === "NORMAL").slice(0, 5),
);

const bannerList = computed(() =>
  allAnnouncements.value.filter((a) => a.displayType === "BANNER"),
);

const dialogList = computed(() =>
  allAnnouncements.value.filter((a) => a.displayType === "DIALOG"),
);

const iconMap: Record<string, any> = {
  INFO: Info,
  WARN: AlertTriangle,
  ERROR: AlertCircle,
  SUCCESS: CheckCircle,
};

const iconColorMap: Record<string, string> = {
  INFO: "text-blue-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  SUCCESS: "text-green-400",
};

const bannerBgMap: Record<string, string> = {
  INFO: "bg-blue-900/50 border-blue-700/50",
  WARN: "bg-yellow-900/50 border-yellow-700/50",
  ERROR: "bg-red-900/50 border-red-700/50",
  SUCCESS: "bg-green-900/50 border-green-700/50",
};

const dialogIconBgMap: Record<string, string> = {
  INFO: "bg-blue-500/20 text-blue-400",
  WARN: "bg-yellow-500/20 text-yellow-400",
  ERROR: "bg-red-500/20 text-red-400",
  SUCCESS: "bg-green-500/20 text-green-400",
};

const currentDialog = ref<Announcement | null>(null);
const showDialog = ref(false);
let dismissedIds: string[] = [];

const closeDialog = () => {
  showDialog.value = false;
  currentDialog.value = null;
};

const dismissDialogForever = () => {
  if (currentDialog.value) {
    const id = currentDialog.value.id;
    if (!dismissedIds.includes(id)) {
      dismissedIds = [...dismissedIds, id];
      try {
        localStorage.setItem(
          "dismissed-announcements",
          JSON.stringify(dismissedIds),
        );
      } catch {}
    }
  }
  closeDialog();
};

const scrollIndex = ref(0);
let scrollTimer: ReturnType<typeof setInterval> | null = null;

const startScroll = () => {
  stopScroll();
  if (normalList.value.length <= 1) return;
  scrollTimer = setInterval(() => {
    scrollIndex.value = (scrollIndex.value + 1) % normalList.value.length;
  }, 3000);
};

const stopScroll = () => {
  if (scrollTimer) {
    clearInterval(scrollTimer);
    scrollTimer = null;
  }
};

const goToScrollItem = (index: number) => {
  scrollIndex.value = index;
  startScroll();
};

onMounted(() => {
  startScroll();

  try {
    const stored = localStorage.getItem("dismissed-announcements");
    if (stored) {
      dismissedIds = JSON.parse(stored) || [];
    }
  } catch {}

  const visible = dialogList.value.find((a) => !dismissedIds.includes(a.id));
  if (visible) {
    currentDialog.value = visible;
    showDialog.value = true;
  }
});

onUnmounted(() => {
  stopScroll();
});

watch(normalList, () => {
  scrollIndex.value = 0;
  startScroll();
});

const formatTime = (dateStr?: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
</script>

<template>
  <!-- 横幅公告 -->
  <div v-if="bannerList.length > 0" class="mb-4 space-y-2">
    <NuxtLink
      v-for="item in bannerList"
      :key="item.id"
      :to="`/announcement/${item.id}`"
      class="flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-colors hover:opacity-80"
      :class="bannerBgMap[item.icon] || bannerBgMap.INFO"
    >
      <component
        :is="iconMap[item.icon] || Megaphone"
        class="w-5 h-5 flex-shrink-0"
        :class="iconColorMap[item.icon]"
      />
      <span class="text-white text-sm font-medium truncate">{{
        item.title
      }}</span>
    </NuxtLink>
  </div>

  <!-- 滚动公告（正常显示方式） -->
  <div
    v-if="normalList.length > 0"
    class="mb-4 flex items-center gap-2 px-3 py-2.5 bg-gray-800/50 rounded-lg"
  >
    <div class="items-center gap-1.5 flex-shrink-0 md:flex hidden">
      <Megaphone class="w-4 h-4 text-primary-400" />
      <span class="text-sm text-primary-400 font-medium">公告</span>
    </div>

    <div class="flex-1 min-w-0 relative h-5 overflow-hidden">
      <Transition name="scroll-announce" mode="default">
        <NuxtLink
          :key="normalList[scrollIndex]?.id"
          :to="`/announcement/${normalList[scrollIndex]?.id}`"
          class="absolute inset-0 flex items-center text-sm text-gray-300 hover:text-primary-400 transition-colors truncate"
        >
          <component
            :is="iconMap[normalList[scrollIndex]?.icon || 'INFO'] || Info"
            class="w-3.5 h-3.5 flex-shrink-0 mr-1.5"
            :class="iconColorMap[normalList[scrollIndex]?.icon || 'INFO']"
          />
          <span class="truncate">{{ normalList[scrollIndex]?.title }}</span>
          <span class="text-gray-600 text-sm ml-1 flex-shrink-0">
            {{ formatTime(normalList[scrollIndex]?.createdAt) }}
          </span>
        </NuxtLink>
      </Transition>
    </div>

    <!-- 指示点 -->
    <div
      v-if="normalList.length > 1"
      class="flex items-center gap-1 flex-shrink-0"
    >
      <button
        v-for="(_, i) in normalList"
        :key="i"
        class="w-1.5 h-1.5 rounded-full transition-colors"
        :class="
          i === scrollIndex ? 'bg-primary-400' : 'bg-gray-600 hover:bg-gray-500'
        "
        @click="goToScrollItem(i)"
      />
    </div>

    <NuxtLink
      to="/announcement"
      class="flex items-center text-sm text-gray-500 hover:text-primary-400 transition-colors flex-shrink-0"
    >
      更多
      <ChevronRight class="w-3 h-3" />
    </NuxtLink>
  </div>

  <!-- 对话框公告 -->
  <ClientOnly>
    <Teleport to="body">
      <Transition name="dialog-announce">
        <div
          v-if="showDialog && currentDialog"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            class="absolute inset-0 bg-black/70 backdrop-blur-sm"
            @click="closeDialog"
          ></div>
          <div
            class="modal-content relative bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-800"
          >
            <button
              class="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors"
              @click="closeDialog"
            >
              <X class="w-5 h-5" />
            </button>

            <div class="flex items-start gap-4 mb-4">
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                :class="dialogIconBgMap[currentDialog.icon]"
              >
                <component
                  :is="iconMap[currentDialog.icon] || Megaphone"
                  class="w-6 h-6"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-lg font-medium text-white">
                  {{ currentDialog.title }}
                </h3>
                <p class="text-xs text-gray-500 mt-1">
                  {{ formatTime(currentDialog.createdAt) }}
                </p>
              </div>
            </div>

            <div
              class="text-sm text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto mb-6 leading-relaxed"
            >
              {{ currentDialog.content || "暂无内容" }}
            </div>

            <div class="flex flex-col gap-3">
              <NuxtLink
                :to="`/announcement/${currentDialog.id}`"
                class="block text-center py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm"
                @click="dismissDialogForever"
              >
                查看详情
              </NuxtLink>
              <div class="flex items-center justify-end">
                <button
                  class="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                  @click="dismissDialogForever"
                >
                  知道了，不再提醒
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.scroll-announce-enter-active,
.scroll-announce-leave-active {
  transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}
.scroll-announce-enter-from {
  opacity: 0;
  transform: translateY(100%);
}
.scroll-announce-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.dialog-announce-leave-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.modal-content {
  will-change: opacity, transform;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(-8px);
}
.dialog-announce-enter-from,
.dialog-announce-leave-to {
  opacity: 0;
}
.dialog-announce-enter-from .modal-content,
.dialog-announce-leave-to .modal-content {
  transform: scale(0.985) translateY(0);
}
</style>
