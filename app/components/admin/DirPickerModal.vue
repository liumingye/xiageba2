<script setup lang="ts">
import { ref, watch } from "vue";
import { X, Loader2, Folder, Check, FolderOpen } from "@lucide/vue";
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
          class="modal-content relative bg-color-100 rounded-2xl p-6 max-w-md w-full border border-color-300 max-h-[80vh] flex flex-col"
        >
          <button
            class="absolute top-4 right-4 p-2 hover:bg-zinc-800 rounded-lg transition-colors z-10"
            @click="handleClose"
          >
            <X class="w-5 h-5 text-zinc-400" />
          </button>

          <h3 class="text-lg font-medium mb-1">选择临时资源目录</h3>
          <p class="text-sm text-gray-500 mb-4">
            {{ getPanTypeLabel(type) }} · 根目录下的文件夹
          </p>

          <!-- 加载中 -->
          <div
            v-if="loading"
            class="flex-1 flex items-center justify-center py-12 text-gray-500"
          >
            <Loader2 class="w-6 h-6 animate-spin mr-2" />
            加载中...
          </div>

          <!-- 错误 -->
          <div
            v-else-if="errorMsg"
            class="flex-1 flex flex-col items-center justify-center py-12 text-color-300"
          >
            <FolderOpen class="w-10 h-10 mb-2" />
            <p class="text-sm">{{ errorMsg }}</p>
          </div>

          <!-- 目录列表 -->
          <div v-else class="flex-1 overflow-y-auto min-h-0 space-y-1">
            <button
              v-for="dir in dirs"
              :key="dir.id"
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
                class="text-xs text-zinc-600 font-mono truncate max-w-[120px]"
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

          <!-- 底部操作 -->
          <div
            class="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-color-300"
          >
            <button
              class="px-4 py-2 bg-color-300 hover:bg-color-400 rounded-lg text-sm transition-colors"
              @click="handleClose"
            >
              取消
            </button>
            <button
              class="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!selectedId"
              @click="handleConfirm"
            >
              <Check class="w-4 h-4" />
              确认
            </button>
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
