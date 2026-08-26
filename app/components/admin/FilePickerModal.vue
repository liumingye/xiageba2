<script setup lang="ts">
import { ref, watch, computed } from "vue";
import {
  X,
  Search,
  Upload,
  Trash2,
  Loader2,
  Check,
  FileText,
  HardDrive,
  ImageIcon,
  FileAudio,
  FileVideo,
  File,
} from "@lucide/vue";
import { get, post, del } from "~/utils/request";
import { formatSize, isImage, isAudio, isVideo } from "~/utils/file";

interface S3ConfigItem {
  id: string;
  name: string;
  bucket: string;
}

interface FileItem {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  url: string;
  mimeType?: string;
}

const toast = useToast();

const props = defineProps<{
  show: boolean;
  configId?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", url: string): void;
}>();

const configs = ref<S3ConfigItem[]>([]);
const selectedConfigId = ref("");
const files = ref<FileItem[]>([]);
const searchKeyword = ref("");
const currentPage = ref(1);
const pageSize = 20;
const total = ref(0);
const isLoading = ref(false);
const isUploading = ref(false);
const showUpload = ref(false);
const uploadFile = ref<File | null>(null);
const uploadPath = ref("");
const selectedFileUrl = ref<string | null>(null);
const deletingKey = ref<string | null>(null);

const totalPages = computed(() => Math.ceil(total.value / pageSize) || 1);

// formatSize / isImage / isAudio / isVideo 已统一抽取到 ~/utils/file

watch(
  () => props.show,
  async (show) => {
    if (show) {
      searchKeyword.value = "";
      currentPage.value = 1;
      selectedFileUrl.value = null;
      showUpload.value = false;
      uploadFile.value = null;
      uploadPath.value = "";

      if (props.configId) {
        selectedConfigId.value = props.configId;
      } else {
        await loadConfigs();
      }
      await loadFiles();
    }
  },
);

const loadConfigs = async () => {
  try {
    const data = await get("/api/admin/storage/config");
    configs.value = data.data || [];
    if (configs.value.length > 0 && !selectedConfigId.value) {
      selectedConfigId.value = configs.value[0].id;
    }
  } catch {
    // ignore
  }
};

const loadFiles = async () => {
  if (!selectedConfigId.value) return;
  isLoading.value = true;
  try {
    const params = new URLSearchParams({
      configId: selectedConfigId.value,
      page: String(currentPage.value),
      pageSize: String(pageSize),
    });
    if (searchKeyword.value.trim()) {
      params.set("search", searchKeyword.value.trim());
    }
    const data = await get(`/api/admin/storage/files?${params}`);
    files.value = data.data || [];
    total.value = data.total || 0;
  } catch {
    files.value = [];
    total.value = 0;
  } finally {
    isLoading.value = false;
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  loadFiles();
};

const onPageChange = (page: number) => {
  currentPage.value = page;
  loadFiles();
};

const selectConfig = () => {
  currentPage.value = 1;
  searchKeyword.value = "";
  selectedFileUrl.value = null;
  loadFiles();
};

const handleFileSelect = (file: FileItem) => {
  selectedFileUrl.value = file.url;
};

const confirmSelect = () => {
  if (!selectedFileUrl.value) return;
  emit("select", selectedFileUrl.value);
};

const handleUploadChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  uploadFile.value = target.files?.[0] || null;
};

const handleUpload = async () => {
  if (!uploadFile.value || !selectedConfigId.value) return;
  isUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", uploadFile.value);
    if (uploadPath.value.trim()) {
      formData.append("path", uploadPath.value.trim());
    }
    const data = await post(
      `/api/admin/storage/files/upload?configId=${selectedConfigId.value}`,
      formData,
    );
    showUpload.value = false;
    uploadFile.value = null;
    uploadPath.value = "";
    await loadFiles();
    if (data.skipped) {
      toast.info(data.message || "文件已存在，已跳过");
    }
    // 自动选中新上传的文件
    if (data.data?.url) {
      selectedFileUrl.value = data.data.url;
    }
  } catch {
    // ignore
  } finally {
    isUploading.value = false;
  }
};

const handleDelete = async (file: FileItem) => {
  if (!confirm(`确定删除文件 ${file.name}？`)) return;
  deletingKey.value = file.key;
  try {
    await del(
      `/api/admin/storage/files/${encodeURIComponent(file.key)}?configId=${selectedConfigId.value}`,
    );
    if (selectedFileUrl.value === file.url) {
      selectedFileUrl.value = null;
    }
    await loadFiles();
  } catch {
    // ignore
  } finally {
    deletingKey.value = null;
  }
};

const handleClose = () => {
  emit("close");
};

const pageNumbers = computed<(number | string)[]>(() => {
  const t = totalPages.value;
  const c = currentPage.value;
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);
  const pages: (number | string)[] = [1];
  if (c > 3) pages.push("...");
  const start = Math.max(2, c - 1);
  const end = Math.min(t - 1, c + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (c < t - 2) pages.push("...");
  pages.push(t);
  return pages;
});
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
          class="modal-content relative bg-zinc-900 rounded-3xl p-6 max-w-3xl w-full border border-zinc-800 max-h-[90vh] flex flex-col"
        >
          <button
            class="absolute top-4 right-4 p-2 hover:bg-zinc-800 rounded-lg transition-colors z-10"
            @click="handleClose"
          >
            <X class="w-5 h-5 text-zinc-400" />
          </button>

          <h3 class="text-xl font-medium text-white mb-4">选择文件</h3>

          <!-- 顶部工具栏 -->
          <div class="flex items-center gap-3 mb-4 flex-wrap">
            <!-- S3 配置选择 -->
            <select
              v-if="!props.configId"
              v-model="selectedConfigId"
              class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
              @change="selectConfig"
            >
              <option value="" disabled>选择存储配置</option>
              <option v-for="c in configs" :key="c.id" :value="c.id">
                {{ c.name }} ({{ c.bucket }})
              </option>
            </select>

            <!-- 搜索 -->
            <div class="flex gap-2 flex-1 min-w-[200px]">
              <input
                v-model="searchKeyword"
                type="text"
                placeholder="搜索文件名..."
                class="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-primary-500"
                @keydown.enter="handleSearch"
              />
              <button
                class="flex items-center gap-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
                @click="handleSearch"
              >
                <Search class="w-4 h-4" />
              </button>
            </div>

            <!-- 上传按钮 -->
            <button
              class="flex items-center gap-1 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm transition-colors"
              @click="showUpload = !showUpload"
            >
              <Upload class="w-4 h-4" />
              上传
            </button>
          </div>

          <!-- 上传面板 -->
          <div
            v-if="showUpload"
            class="mb-4 p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl space-y-3"
          >
            <div class="flex items-center gap-3 flex-wrap">
              <input
                type="file"
                class="text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary-500 file:text-white file:cursor-pointer"
                @change="handleUploadChange"
              />
              <input
                v-model="uploadPath"
                type="text"
                placeholder="自定义路径（可选，如 images/covers）"
                class="flex-1 min-w-[160px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-primary-500"
              />
              <button
                class="flex items-center gap-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                :disabled="!uploadFile || isUploading"
                @click="handleUpload"
              >
                <Loader2 v-if="isUploading" class="w-4 h-4 animate-spin" />
                <Upload v-else class="w-4 h-4" />
                {{ isUploading ? "上传中..." : "确认上传" }}
              </button>
            </div>
          </div>

          <!-- 文件列表 -->
          <div class="flex-1 overflow-y-auto min-h-0">
            <div
              v-if="isLoading"
              class="flex items-center justify-center py-12 text-zinc-500"
            >
              <Loader2 class="w-6 h-6 animate-spin mr-2" />
              加载中...
            </div>

            <div
              v-else-if="!selectedConfigId"
              class="flex flex-col items-center justify-center py-12 text-zinc-500"
            >
              <HardDrive class="w-10 h-10 mb-2 text-zinc-600" />
              <p class="text-sm">请选择存储配置</p>
            </div>

            <div
              v-else-if="files.length === 0"
              class="flex flex-col items-center justify-center py-12 text-zinc-500"
            >
              <FileText class="w-10 h-10 mb-2 text-zinc-600" />
              <p class="text-sm">暂无文件</p>
            </div>

            <!-- Grid 文件列表 -->
            <div
              v-else
              class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
            >
              <div
                v-for="file in files"
                :key="file.key"
                class="group relative bg-zinc-800/50 border rounded-xl overflow-hidden cursor-pointer transition-colors"
                :class="
                  selectedFileUrl === file.url
                    ? 'border-primary-500 ring-1 ring-primary-500/30'
                    : 'border-zinc-800 hover:border-zinc-600'
                "
                @click="handleFileSelect(file)"
              >
                <!-- 预览区域 -->
                <div
                  class="aspect-square flex items-center justify-center bg-zinc-900/50 relative overflow-hidden"
                >
                  <img
                    v-if="isImage(file)"
                    :src="file.url"
                    :alt="file.name"
                    loading="lazy"
                    class="w-full h-full object-cover"
                    @error="($event.target as any).style.display='none'"
                  />
                  <FileAudio
                    v-else-if="isAudio(file)"
                    class="w-8 h-8 text-zinc-600"
                  />
                  <FileVideo
                    v-else-if="isVideo(file)"
                    class="w-8 h-8 text-zinc-600"
                  />
                  <File v-else class="w-8 h-8 text-zinc-600" />

                  <!-- 选中指示 -->
                  <div
                    v-if="selectedFileUrl === file.url"
                    class="absolute top-2 right-2 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center"
                  >
                    <Check class="w-3 h-3 text-white" />
                  </div>

                  <!-- 悬浮删除按钮 -->
                  <button
                    class="absolute top-2 left-2 p-1.5 text-zinc-300 hover:text-red-500 bg-zinc-800/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-wait"
                    :disabled="deletingKey === file.key"
                    :class="{ '!opacity-100': deletingKey === file.key }"
                    @click.stop="handleDelete(file)"
                  >
                    <Loader2 v-if="deletingKey === file.key" class="w-3.5 h-3.5 animate-spin" />
                    <Trash2 v-else class="w-3.5 h-3.5" />
                  </button>
                </div>

                <!-- 文件信息 -->
                <div class="p-2">
                  <p
                    class="text-xs text-white truncate"
                    :title="file.name"
                  >
                    {{ file.name }}
                  </p>
                  <p class="text-[10px] text-zinc-500 mt-0.5">
                    {{ formatSize(file.size) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 分页 -->
          <div
            v-if="totalPages > 1"
            class="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800"
          >
            <div class="text-sm text-zinc-500">共 {{ total }} 个文件</div>
            <div class="flex items-center gap-1">
              <button
                :disabled="currentPage === 1"
                class="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                @click="onPageChange(currentPage - 1)"
              >
                <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                v-for="p in pageNumbers"
                :key="p"
                :class="[
                  'min-w-[32px] h-8 px-2 text-sm rounded transition-colors',
                  p === currentPage
                    ? 'bg-primary-500 text-white'
                    : p === '...'
                      ? 'text-zinc-500 cursor-default'
                      : 'text-zinc-400 hover:text-white',
                ]"
                @click="typeof p === 'number' && onPageChange(p)"
              >
                {{ p }}
              </button>
              <button
                :disabled="currentPage === totalPages"
                class="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                @click="onPageChange(currentPage + 1)"
              >
                <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div
            class="mt-4 flex items-center justify-end gap-3 border-t border-zinc-800 pt-4"
          >
            <button
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
              @click="handleClose"
            >
              取消
            </button>
            <button
              class="flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!selectedFileUrl"
              @click="confirmSelect"
            >
              <Check class="w-4 h-4" />
              确认选择
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
