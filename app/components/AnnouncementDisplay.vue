<script setup lang="ts">
import { Megaphone, ChevronRight, X } from "@lucide/vue";
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

const map: Record<
  "INFO" | "WARN" | "ERROR" | "SUCCESS",
  {
    color: string;
    icon: string;
    alert: "info" | "warning" | "error" | "success";
    dialog: string;
  }
> = {
  INFO: {
    color: "text-blue-400",
    icon: "i-lucide-info",
    alert: "info",
    dialog: "bg-blue-500/20 text-blue-400",
  },
  WARN: {
    color: "text-yellow-400",
    icon: "i-lucide-alert-triangle",
    alert: "warning",
    dialog: "bg-yellow-500/20 text-yellow-400",
  },
  ERROR: {
    color: "text-red-400",
    icon: "i-lucide-x-circle",
    alert: "error",
    dialog: "bg-red-500/20 text-red-400",
  },
  SUCCESS: {
    color: "text-green-400",
    icon: "i-lucide-check-circle",
    alert: "success",
    dialog: "bg-green-500/20 text-green-400",
  },
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
const { resume: resumeScroll, pause: pauseScroll } = useIntervalFn(
  () => {
    const len = normalList.value.length;
    if (len <= 1) return;
    scrollIndex.value = (scrollIndex.value + 1) % len;
  },
  3000,
  { immediate: false },
);

const startScroll = () => {
  pauseScroll();
  if (normalList.value.length <= 1) return;
  scrollIndex.value = 0;
  resumeScroll();
};

const goToScrollItem = (index: number) => {
  scrollIndex.value = index;
  pauseScroll();
  resumeScroll();
};

onMounted(() => {
  startScroll();

  const visible = dialogList.value.find(
    (a) => !dismissedIds.value.includes(a.id),
  );
  if (visible) {
    console.log(currentDialog.value);
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
  <div v-if="bannerList.length > 0" class="mb-4">
    <NuxtLink
      v-for="item in bannerList"
      :key="item.id"
      :to="`/announcement/${item.id}`"
    >
      <UAlert
        class="mb-2"
        :title="item.title"
        :icon="map[item.icon].icon"
        :color="map[item.icon].alert"
      />
    </NuxtLink>
  </div>

  <!-- 滚动公告（正常显示方式） -->
  <div
    v-if="normalList.length > 0"
    class="mb-4 flex items-center gap-2 px-3 py-2.5 bg-muted rounded-xl border border-muted"
  >
    <div class="items-center gap-1.5 shrink-0 md:flex hidden">
      <Megaphone class="w-4 h-4 text-primary" />
      <span class="text-sm text-muted font-medium">公告</span>
    </div>

    <div class="flex-1 min-w-0 relative h-5 overflow-hidden">
      <Transition name="scroll-announce" mode="default">
        <NuxtLink
          :key="normalList[scrollIndex]?.id"
          :to="`/announcement/${normalList[scrollIndex]?.id}`"
          class="absolute inset-0 flex items-center text-sm text-toned hover:text-primary-500 transition-colors truncate"
        >
          <UIcon
            :name="map[normalList[scrollIndex]?.icon || 'INFO'].icon"
            class="size-3.5 shrink-0 mr-1.5"
            :class="map[normalList[scrollIndex]?.icon || 'INFO'].color"
          />
          <span class="truncate">{{ normalList[scrollIndex]?.title }}</span>
          <span
            v-if="normalList[scrollIndex]"
            class="text-muted text-sm ml-1 shrink-0"
          >
            <NuxtTime :datetime="normalList[scrollIndex]!.createdAt" relative />
          </span>
        </NuxtLink>
      </Transition>
    </div>

    <!-- 指示点 -->
    <div v-if="normalList.length > 1" class="flex items-center gap-1 shrink-0">
      <button
        v-for="(_, i) in normalList"
        :key="i"
        class="w-2 h-2 rounded-full transition-colors"
        :class="
          i === scrollIndex
            ? 'bg-primary-400'
            : 'bg-accented hover:bg-primary-500'
        "
        @click="goToScrollItem(i)"
      />
    </div>

    <NuxtLink
      to="/announcement"
      class="flex items-center text-sm text-toned hover:text-primary-500 transition-colors shrink-0"
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
            class="modal-content relative bg-default rounded-2xl p-6 max-w-md w-full border border-muted"
          >
            <button
              class="absolute top-4 right-4 p-2 opacity-80 hover:opacity-100 hover:bg-muted rounded-lg transition-all"
              @click="closeDialog"
            >
              <X class="size-5" />
            </button>

            <div class="flex items-start gap-4 mb-4">
              <div
                class="size-12 rounded-xl flex items-center justify-center shrink-0"
                :class="map[currentDialog.icon].dialog"
              >
                <UIcon :name="map[currentDialog.icon].icon" class="size-6" />
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
              class="text-sm whitespace-pre-wrap max-h-60 overflow-y-auto mb-6 leading-relaxed"
            >
              {{ currentDialog.content || "暂无内容" }}
            </div>

            <div class="flex flex-col gap-3">
              <UButton
                block
                :to="`/announcement/${currentDialog.id}`"
                @click="dismissDialogForever"
              >
                查看详情
              </UButton>
              <div class="flex items-center justify-end">
                <UButton variant="link" @click="dismissDialogForever">
                  知道了，不再提醒
                </UButton>
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
