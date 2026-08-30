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
import { useIntervalFn, useLocalStorage } from "@vueuse/core";
import type { Announcement } from "~/utils/announcement";

const { data } = await useFetch<{ data: Announcement[] }>("/api/announcement", {
  query: { pageSize: 10 },
  server: true,
  default: () => ({ data: [] }),
});

const allAnnouncements = computed(() => data.value?.data || []);

const normalList = computed(() =>
  allAnnouncements.value.filter((a) => a.displayType === "NORMAL").slice(0, 3),
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
  INFO: "bg-blue-900 border-blue-700 !text-white",
  WARN: "bg-yellow-900 border-yellow-700 !text-white",
  ERROR: "bg-red-900 border-red-700 !text-white",
  SUCCESS: "bg-green-900 border-green-700 !text-white",
};

const dialogIconBgMap: Record<string, string> = {
  INFO: "bg-blue-500/20 text-blue-400",
  WARN: "bg-yellow-500/20 text-yellow-400",
  ERROR: "bg-red-500/20 text-red-400",
  SUCCESS: "bg-green-500/20 text-green-400",
};

const currentDialog = ref<Announcement | null>(null);
const showDialog = ref(false);

// 已永久关闭的公告 ID，自动持久化到 localStorage（组件卸载时无需手动清理）
const dismissedIds = useLocalStorage<string[]>("dismissed-announcements", []);

const closeDialog = () => {
  showDialog.value = false;
  currentDialog.value = null;
};

const dismissDialogForever = () => {
  if (currentDialog.value) {
    const id = currentDialog.value.id;
    if (!dismissedIds.value.includes(id)) {
      dismissedIds.value = [...dismissedIds.value, id];
    }
  }
  closeDialog();
};

const scrollIndex = ref(0);

// useIntervalFn 每 3s 轮换一条公告，组件卸载时自动清理计时器。
// immediate: false 避免数据加载前定时器空转；回调内做长度防护，
// 否则 normalList 为空时 (x + 1) % 0 会得到 NaN。
const { resume: resumeScroll, pause: pauseScroll } = useIntervalFn(() => {
  const len = normalList.value.length;
  if (len <= 1) return;
  scrollIndex.value = (scrollIndex.value + 1) % len;
}, 3000, { immediate: false });

const startScroll = () => {
  pauseScroll();
  if (normalList.value.length <= 1) return;
  scrollIndex.value = 0;
  resumeScroll();
};

const goToScrollItem = (index: number) => {
  scrollIndex.value = index;
  startScroll();
};

onMounted(() => {
  startScroll();

  const visible = dialogList.value.find(
    (a) => !dismissedIds.value.includes(a.id),
  );
  if (visible) {
    currentDialog.value = visible;
    showDialog.value = true;
  }
});

watch(normalList, () => {
  scrollIndex.value = 0;
  startScroll();
});
</script>

<template>
  <!-- 横幅公告 -->
  <div v-if="bannerList.length > 0" class="mb-4 space-y-2">
    <NuxtLink
      v-for="item in bannerList"
      :key="item.id"
      :to="`/announcement/${item.id}`"
      class="flex items-center gap-3 px-4 py-2.5 rounded-lg border transition hover:opacity-90"
      :class="bannerBgMap[item.icon] || bannerBgMap.INFO"
    >
      <component
        :is="iconMap[item.icon] || Megaphone"
        class="w-5 h-5 flex-shrink-0"
        :class="iconColorMap[item.icon]"
      />
      <span class="text-sm font-medium truncate">{{ item.title }}</span>
    </NuxtLink>
  </div>

  <!-- 滚动公告（正常显示方式） -->
  <div
    v-if="normalList.length > 0"
    class="mb-4 flex items-center gap-2 px-3 py-2.5 bg-color-100 rounded-lg border border-color-100"
  >
    <div class="items-center gap-1.5 flex-shrink-0 md:flex hidden">
      <Megaphone class="w-4 h-4 text-primary-500" />
      <span class="text-sm text-color-400 font-medium">公告</span>
    </div>

    <div class="flex-1 min-w-0 relative h-5 overflow-hidden">
      <Transition name="scroll-announce" mode="default">
        <NuxtLink
          :key="normalList[scrollIndex]?.id"
          :to="`/announcement/${normalList[scrollIndex]?.id}`"
          class="absolute inset-0 flex items-center text-sm text-color-300 hover:text-primary-400 transition-colors truncate"
        >
          <component
            :is="iconMap[normalList[scrollIndex]?.icon || 'INFO'] || Info"
            class="w-3.5 h-3.5 flex-shrink-0 mr-1.5"
            :class="iconColorMap[normalList[scrollIndex]?.icon || 'INFO']"
          />
          <span class="truncate">{{ normalList[scrollIndex]?.title }}</span>
          <span
            v-if="normalList[scrollIndex]"
            class="text-color-500 text-sm ml-1 flex-shrink-0"
          >
            <NuxtTime :datetime="normalList[scrollIndex]!.createdAt" relative />
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
          i === scrollIndex ? 'bg-primary-400' : 'bg-zinc-600 hover:bg-zinc-500'
        "
        @click="goToScrollItem(i)"
      />
    </div>

    <NuxtLink
      to="/announcement"
      class="flex items-center text-sm text-color-300 hover:text-primary-400 transition-colors flex-shrink-0"
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
            class="modal-content relative bg-color-100 rounded-2xl p-6 max-w-md w-full border border-color-300"
          >
            <button
              class="absolute top-4 right-4 p-2 opacity-80 hover:opacity-100 hover:bg-color-300 rounded-lg transition-all"
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
                <h3 class="text-lg font-medium">
                  {{ currentDialog.title }}
                </h3>
                <p class="text-xs text-gray-500">
                  <NuxtTime :datetime="currentDialog.createdAt" relative />
                </p>
              </div>
            </div>

            <div
              class="text-sm text-color-300 whitespace-pre-wrap max-h-60 overflow-y-auto mb-6 leading-relaxed"
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
                  class="text-xs text-color-300 hover:text-primary-500 transition-colors"
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
