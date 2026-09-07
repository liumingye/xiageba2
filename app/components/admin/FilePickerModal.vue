<script setup lang="ts">
import { ref, watch, computed } from "vue";
import {
  FileText,
  HardDrive,
  FileAudio,
  FileVideo,
  File,
  Loader2,
  Check,
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
    if (
      configs.value.length > 0 &&
      !selectedConfigId.value &&
      configs.value[0]
    ) {
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
      toast.add({
        title: data.message || "文件已存在，已跳过",
        icon: "i-lucide-x",
        color: "error",
        duration: 2000,
      });
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
  <UModal
    :open="show"
    title="选择文件"
    :ui="{
      content: 'max-w-3xl',
      body: 'flex-1 flex flex-col min-h-0 overflow-hidden p-4 sm:p-6',
      footer: 'justify-end',
    }"
    @update:open="(v) => { if (!v) handleClose(); }"
  >
    <template #body>
      <!-- 顶部工具栏 -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <!-- S3 配置选择 -->
        <USelect
          v-if="!props.configId"
          v-model="selectedConfigId"
          size="sm"
          class="max-w-56"
          :items="
            configs.map((c) => ({
              label: `${c.name} (${c.bucket})`,
              value: c.id,
            }))
          "
          placeholder="选择存储配置"
          @change="selectConfig"
        />

        <!-- 搜索 -->
        <div class="flex gap-2 flex-1 min-w-50">
          <UInput
            v-model="searchKeyword"
            type="text"
            placeholder="搜索文件名..."
            size="sm"
            class="flex-1"
            @keydown.enter="handleSearch"
          />
          <UButton
            color="neutral"
            variant="soft"
            square
            size="sm"
            icon="i-lucide-search"
            aria-label="搜索"
            @click="handleSearch"
          />
        </div>

        <!-- 上传按钮 -->
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-upload"
          @click="showUpload = !showUpload"
        >
          上传
        </UButton>
      </div>

      <!-- 上传面板 -->
      <UCard
        v-if="showUpload"
        class="mb-4"
        :ui="{
          body: 'p-4 space-y-3',
        }"
      >
        <div class="flex items-center gap-3 flex-wrap">
          <UInput
            type="file"
            class="text-sm"
            @change="handleUploadChange"
          />
          <UInput
            v-model="uploadPath"
            type="text"
            placeholder="自定义路径（可选，如 images/covers）"
            class="flex-1 min-w-40"
          />
          <UButton
            color="primary"
            icon="i-lucide-upload"
            :loading="isUploading"
            :disabled="!uploadFile || isUploading"
            @click="handleUpload"
          >
            {{ isUploading ? "上传中..." : "确认上传" }}
          </UButton>
        </div>
      </UCard>

      <!-- 文件列表 -->
      <div class="flex-1 overflow-y-auto min-h-0">
        <div
          v-if="isLoading"
          class="flex items-center justify-center py-12 text-gray-500"
        >
          <Loader2 class="w-6 h-6 animate-spin mr-2" />
          加载中...
        </div>

        <div
          v-else-if="!selectedConfigId"
          class="flex flex-col items-center justify-center py-12 text-gray-500"
        >
          <HardDrive class="w-10 h-10 mb-2" />
          <p class="text-sm">请选择存储配置</p>
        </div>

        <div
          v-else-if="files.length === 0"
          class="flex flex-col items-center justify-center py-12 text-gray-500"
        >
          <FileText class="w-10 h-10 mb-2" />
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
            class="group relative border rounded-xl overflow-hidden cursor-pointer transition-colors"
            :class="
              selectedFileUrl === file.url
                ? 'border-primary-500 ring-1 ring-primary-500/30'
                : 'border-color-300 hover:border-color-400'
            "
            @click="handleFileSelect(file)"
          >
            <!-- 预览区域 -->
            <div
              class="aspect-square flex items-center justify-center relative overflow-hidden"
            >
              <img
                v-if="isImage(file)"
                :src="file.url"
                :alt="file.name"
                loading="lazy"
                class="w-full h-full object-cover"
                @error="($event.target as any).style.display = 'none'"
              />
              <FileAudio
                v-else-if="isAudio(file)"
                class="w-8 h-8 text-color-300"
              />
              <FileVideo
                v-else-if="isVideo(file)"
                class="w-8 h-8 text-color-300"
              />
              <File v-else class="w-8 h-8 text-color-300" />

              <!-- 选中指示 -->
              <div
                v-if="selectedFileUrl === file.url"
                class="absolute top-2 right-2 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center"
              >
                <Check class="w-3 h-3 text-white" />
              </div>

              <!-- 悬浮删除按钮 -->
              <UButton
                color="error"
                variant="solid"
                square
                size="sm"
                icon="i-lucide-trash-2"
                :loading="deletingKey === file.key"
                :disabled="deletingKey === file.key"
                class="absolute top-2 left-2 z-10 shadow-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-100"
                :aria-label="`删除 ${file.name}`"
                @click.stop="handleDelete(file)"
              />
            </div>

            <!-- 文件信息 -->
            <div class="p-2">
              <p class="text-xs truncate" :title="file.name">
                {{ file.name }}
              </p>
              <p class="text-[10px] text-gray-500 mt-0.5">
                {{ formatSize(file.size) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <AdminPagination
        :current-page="currentPage"
        :total-pages="totalPages"
        :total="total"
        item-label="个文件"
        @page-change="onPageChange"
      />
    </template>

    <!-- 底部操作 -->
    <template #footer>
      <UButton color="neutral" variant="soft" @click="handleClose">
        取消
      </UButton>
      <UButton
        color="primary"
        icon="i-lucide-check"
        :disabled="!selectedFileUrl"
        @click="confirmSelect"
      >
        确认选择
      </UButton>
    </template>
  </UModal>
</template>
