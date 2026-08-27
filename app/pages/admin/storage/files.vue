<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import {
  FileText,
  Upload,
  Search,
  Trash2,
  X,
  Loader2,
  Copy,
  HardDrive,
  FileAudio,
  FileVideo,
  File,
  Pencil,
  Check,
} from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";
import { useToast } from "~/composables/useToast";
import { useClipboard } from "@vueuse/core";
import { get, post, del, patch } from "~/utils/request";
import { formatSize, formatDate, isImage, isAudio, isVideo } from "~/utils/file";

defineOptions({ name: "StorageFilesPage" });

interface StorageConfig {
  id: string;
  name: string;
  bucket: string;
  [key: string]: unknown;
}

interface StorageFile {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  url: string;
  mimeType?: string;
}

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();
const toast = useToast();

const configs = ref<StorageConfig[]>([]);
const selectedConfigId = ref<string>("");
const files = ref<StorageFile[]>([]);
const searchKeyword = ref<string>("");
const currentPage = ref<number>(1);
const pageSize = 20;
const total = ref<number>(0);
const isLoading = ref<boolean>(false);
const isUploading = ref<boolean>(false);
const showUpload = ref<boolean>(false);
const uploadFile = ref<File | null>(null);
const uploadPath = ref<string>("");

const totalPages = computed(() => Math.ceil(total.value / pageSize) || 1);

// formatSize / formatDate / isImage / isAudio / isVideo 已统一抽取到 ~/utils/file

const loadConfigs = async () => {
  const data = await get("/api/admin/storage/config");
  configs.value = data.data || [];
  if (configs.value.length > 0 && !selectedConfigId.value) {
    selectedConfigId.value = configs.value[0].id;
  }
};

const loadFiles = async () => {
  if (!selectedConfigId.value) {
    files.value = [];
    total.value = 0;
    return;
  }
  isLoading.value = true;
  try {
    let url = `/api/admin/storage/files?configId=${encodeURIComponent(selectedConfigId.value)}&page=${currentPage.value}&pageSize=${pageSize}`;
    if (searchKeyword.value) {
      url += `&search=${encodeURIComponent(searchKeyword.value)}`;
    }
    const data = await get(url);
    files.value = data.data || [];
    total.value = data.total || 0;
  } catch {
    toast.error("加载文件列表失败");
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

const toggleUpload = () => {
  showUpload.value = !showUpload.value;
  if (!showUpload.value) {
    uploadFile.value = null;
    uploadPath.value = "";
  }
};

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  uploadFile.value = target.files?.[0] || null;
};

const handleUpload = async () => {
  if (!uploadFile.value) {
    toast.error("请选择要上传的文件");
    return;
  }
  if (!selectedConfigId.value) {
    toast.error("请先选择存储配置");
    return;
  }
  isUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", uploadFile.value);
    if (uploadPath.value) {
      formData.append("path", uploadPath.value);
    }
    const data = await post(
      `/api/admin/storage/files/upload?configId=${encodeURIComponent(selectedConfigId.value)}`,
      formData,
    );
    if (data.skipped) {
      toast.info(data.message || "文件已存在，已跳过");
    } else {
      toast.success("上传成功");
    }
    uploadFile.value = null;
    uploadPath.value = "";
    showUpload.value = false;
    await loadFiles();
  } catch (err: any) {
    toast.error(err?.response?.data?.message || "上传失败，请重试");
  } finally {
    isUploading.value = false;
  }
};

const deletingKey = ref<string | null>(null);

const handleDelete = async (file: StorageFile) => {
  if (!selectedConfigId.value) return;
  if (!confirm(`确定要删除文件 ${file.name} 吗？`)) return;
  deletingKey.value = file.key;
  try {
    await del(
      `/api/admin/storage/files/${encodeURIComponent(file.key)}?configId=${encodeURIComponent(selectedConfigId.value)}`,
    );
    toast.success("删除成功");
    await loadFiles();
  } catch (err: any) {
    toast.error(err?.response?.data?.message || "删除失败，请重试");
  } finally {
    deletingKey.value = null;
  }
};

const { copy: copyText } = useClipboard();

const copyUrl = async (file: StorageFile) => {
  try {
    await copyText(file.url);
    toast.success("链接已复制");
  } catch {
    toast.error("复制失败");
  }
};

// 重命名
const renameTarget = ref<StorageFile | null>(null);
const renameValue = ref<string>("");
const isRenaming = ref<boolean>(false);

const startRename = (file: StorageFile) => {
  renameTarget.value = file;
  renameValue.value = file.name;
};

const cancelRename = () => {
  renameTarget.value = null;
  renameValue.value = "";
};

const confirmRename = async () => {
  if (!renameTarget.value || !selectedConfigId.value) return;
  const newName = renameValue.value.trim();
  if (!newName) {
    toast.error("文件名不能为空");
    return;
  }
  if (newName === renameTarget.value.name) {
    cancelRename();
    return;
  }
  isRenaming.value = true;
  try {
    await patch(
      `/api/admin/storage/files/${encodeURIComponent(renameTarget.value.key)}?configId=${encodeURIComponent(selectedConfigId.value)}`,
      { newName },
    );
    toast.success("重命名成功");
    cancelRename();
    await loadFiles();
  } catch (err: any) {
    toast.error(err?.response?.data?.message || "重命名失败，请重试");
  } finally {
    isRenaming.value = false;
  }
};

watch(selectedConfigId, () => {
  currentPage.value = 1;
  loadFiles();
});

onMounted(async () => {
  if (!initialized.value) {
    checkLogin();
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!isLoggedIn.value) {
    router.push("/admin/login");
    return;
  }
  await loadConfigs();
  await loadFiles();
});
</script>

<template>
  <div class="min-h-screen">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-2 py-6 sm:px-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">文件管理</h2>
        <div class="flex items-center gap-3">
          <button
            class="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
            @click="handleSearch"
          >
            <Search class="w-4 h-4" />
            搜索
          </button>
          <button
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            @click="toggleUpload"
          >
            <Upload class="w-4 h-4" />
            上传
          </button>
        </div>
      </div>

      <div class="flex items-center gap-3 mb-3 justify-end">
        <select
          v-model="selectedConfigId"
          class="input-search py-2 px-3 text-sm flex-1 max-w-24"
        >
          <option value="" disabled>请选择存储配置</option>
          <option v-for="cfg in configs" :key="cfg.id" :value="cfg.id">
            {{ cfg.name }} ({{ cfg.bucket }})
          </option>
        </select>
        <div class="relative flex-1 max-w-md">
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索文件名"
            class="input-search py-2 pl-9 pr-3 text-sm"
            @keyup.enter="handleSearch"
          />
          <Search
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
          />
        </div>
      </div>

      <div
        v-if="showUpload"
        class="card p-4 mb-4 flex flex-wrap items-end gap-4"
      >
        <div class="flex-1 min-w-[200px]">
          <label class="block text-zinc-400 text-sm mb-2">选择文件 *</label>
          <input
            type="file"
            class="input-search py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-white hover:file:bg-zinc-600"
            @change="handleFileChange"
          />
        </div>
        <div class="flex-1 min-w-[200px]">
          <label class="block text-zinc-400 text-sm mb-2"
            >上传路径（可选）</label
          >
          <input
            v-model="uploadPath"
            type="text"
            placeholder="例如：music/2026/"
            class="input-search py-2 px-3 text-sm"
          />
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="isUploading || !uploadFile"
            @click="handleUpload"
          >
            <Loader2 v-if="isUploading" class="w-4 h-4 animate-spin" />
            <Upload v-else class="w-4 h-4" />
            {{ isUploading ? "上传中..." : "开始上传" }}
          </button>
          <button
            class="p-2 text-zinc-400 hover:text-white transition-colors"
            title="关闭"
            @click="toggleUpload"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div class="card p-4">
        <!-- 加载中 -->
        <div v-if="isLoading" class="py-16 text-center">
          <Loader2 class="w-6 h-6 text-primary-500 animate-spin mx-auto" />
          <p class="text-zinc-500 text-sm mt-2">加载中...</p>
        </div>

        <!-- 未选择配置 -->
        <div v-else-if="!selectedConfigId" class="py-16 text-center">
          <HardDrive class="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <p class="text-zinc-500">请选择存储配置</p>
        </div>

        <!-- 空状态 -->
        <div v-else-if="files.length === 0" class="py-16 text-center">
          <FileText class="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <p class="text-zinc-500">暂无文件</p>
        </div>

        <!-- Grid 文件列表 -->
        <div
          v-else
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
        >
          <div
            v-for="file in files"
            :key="file.key"
            class="group bg-zinc-800/50 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-colors"
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
                @error="($event.target as any).style.display = 'none'"
              />
              <FileAudio
                v-else-if="isAudio(file)"
                class="w-10 h-10 text-zinc-600"
              />
              <FileVideo
                v-else-if="isVideo(file)"
                class="w-10 h-10 text-zinc-600"
              />
              <File v-else class="w-10 h-10 text-zinc-600" />

              <!-- 悬浮操作 -->
              <div
                class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
              >
                <button
                  class="p-2 text-zinc-300 hover:text-primary-500 transition-colors bg-zinc-800/80 rounded-lg"
                  title="复制链接"
                  @click="copyUrl(file)"
                >
                  <Copy class="w-4 h-4" />
                </button>
                <button
                  class="p-2 text-zinc-300 hover:text-primary-500 transition-colors bg-zinc-800/80 rounded-lg"
                  title="重命名"
                  :disabled="deletingKey === file.key"
                  @click="startRename(file)"
                >
                  <Pencil class="w-4 h-4" />
                </button>
                <button
                  class="p-2 text-zinc-300 hover:text-red-500 transition-colors bg-zinc-800/80 rounded-lg disabled:opacity-50 disabled:cursor-wait"
                  title="删除"
                  :disabled="deletingKey === file.key"
                  @click="handleDelete(file)"
                >
                  <Loader2
                    v-if="deletingKey === file.key"
                    class="w-4 h-4 animate-spin"
                  />
                  <Trash2 v-else class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- 文件信息 -->
            <div class="p-2.5">
              <!-- 重命名输入框 -->
              <div
                v-if="renameTarget?.key === file.key"
                class="flex items-center gap-1"
              >
                <input
                  v-model="renameValue"
                  type="text"
                  class="w-full bg-zinc-900 border border-primary-500 rounded text-xs text-white px-1.5 py-1 focus:outline-none"
                  @keyup.enter="confirmRename"
                  @keyup.esc="cancelRename"
                />
                <button
                  class="p-1 text-primary-500 hover:text-primary-400 shrink-0"
                  :disabled="isRenaming"
                  title="确认"
                  @click="confirmRename"
                >
                  <Loader2 v-if="isRenaming" class="w-3.5 h-3.5 animate-spin" />
                  <Check v-else class="w-3.5 h-3.5" />
                </button>
                <button
                  class="p-1 text-zinc-500 hover:text-zinc-400 shrink-0"
                  title="取消"
                  @click="cancelRename"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
              <!-- 正常文件名 -->
              <template v-else>
                <p class="text-xs text-white truncate" :title="file.name">
                  {{ file.name }}
                </p>
                <div class="flex items-center justify-between mt-1">
                  <span class="text-[10px] text-zinc-500">{{
                    formatSize(file.size)
                  }}</span>
                  <span class="text-[10px] text-zinc-600">{{
                    formatDate(file.lastModified).split(" ")[0]
                  }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>

        <AdminPagination
          v-if="totalPages > 1"
          :current-page="currentPage"
          :total-pages="totalPages"
          :total="total"
          item-label="个文件"
          @page-change="onPageChange"
        />
      </div>
    </main>
  </div>
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
