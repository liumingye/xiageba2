<script setup lang="ts">
import { ref, watch } from "vue";
import { Loader2, Folder, Check, FolderOpen } from "@lucide/vue";
import { get } from "~/utils/request";
import { getPanTypeLabel } from "~/utils/pan";

interface DirItem {
  id: string;
  name: string;
}

const props = defineProps<{
  show: boolean;
  type: "quark" | "baidu" | "uc" | "xunlei";
  accountId?: number;
  cookie?: string;
  refreshToken?: string;
  accessToken?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", id: string): void;
}>();

const dirs = ref<DirItem[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const errorMsg = ref("");

const loadDirs = async () => {
  loading.value = true;
  errorMsg.value = "";
  selectedId.value = null;
  try {
    let url: string;
    if (props.accountId) {
      url = `/api/admin/list-dir?accountId=${props.accountId}`;
    } else {
      // 临时凭证模式（添加账号时预览目录）
      const params = new URLSearchParams({ type: props.type });
      if (props.cookie) params.set("cookie", props.cookie);
      if (props.refreshToken) params.set("refreshToken", props.refreshToken);
      if (props.accessToken) params.set("accessToken", props.accessToken);
      url = `/api/admin/list-dir?${params.toString()}`;
    }
    const data = await get(url);
    dirs.value = data.list || [];
    if (dirs.value.length === 0) {
      errorMsg.value = "根目录下没有文件夹";
    }
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.message || "获取目录列表失败";
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.show,
  (show) => {
    if (show) {
      loadDirs();
    }
  },
);

const handleSelect = (dir: DirItem) => {
  selectedId.value = dir.id;
};

const handleConfirm = () => {
  if (selectedId.value) {
    emit("select", selectedId.value);
  }
};

const handleClose = () => {
  emit("close");
};
</script>

<template>
  <UModal
    :open="show"
    title="选择临时资源目录"
    @update:open="
      (v) => {
        if (!v) handleClose();
      }
    "
    :ui="{
      footer: 'justify-end',
    }"
  >
    <template #body>
      <p class="text-sm text-gray-500 mb-4">
        {{ getPanTypeLabel(type) }} · 根目录下的文件夹
      </p>

      <!-- 加载中 -->
      <div
        v-if="loading"
        class="flex items-center justify-center py-12 text-gray-500"
      >
        <Loader2 class="w-6 h-6 animate-spin mr-2" />
        加载中...
      </div>

      <!-- 错误 -->
      <div
        v-else-if="errorMsg"
        class="flex flex-col items-center justify-center py-12 text-color-300"
      >
        <FolderOpen class="w-10 h-10 mb-2" />
        <p class="text-sm">{{ errorMsg }}</p>
      </div>

      <!-- 目录列表 -->
      <div v-else class="max-h-[55vh] overflow-y-auto space-y-1">
        <button
          v-for="dir in dirs"
          :key="dir.id"
          type="button"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left text-color-100 border"
          :class="
            selectedId === dir.id
              ? 'bg-primary-500/20 border-primary-500'
              : 'hover:bg-color-300 border-color-300'
          "
          @click="handleSelect(dir)"
        >
          <Folder
            class="w-4 h-4 shrink-0"
            :class="
              selectedId === dir.id ? 'text-primary-400' : 'text-zinc-500'
            "
          />
          <span class="flex-1 text-sm truncate">{{ dir.name }}</span>
          <span
            class="text-xs text-zinc-600 font-mono truncate max-w-30"
            :title="dir.id"
          >
            {{ dir.id }}
          </span>
          <Check
            v-if="selectedId === dir.id"
            class="w-4 h-4 text-primary-400 shrink-0"
          />
        </button>
      </div>
    </template>

    <!-- 底部操作 -->
    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <UButton color="neutral" variant="ghost" @click="handleClose">
          取消
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-check"
          :disabled="!selectedId"
          @click="handleConfirm"
        >
          确认
        </UButton>
      </div>
    </template>
  </UModal>
</template>
