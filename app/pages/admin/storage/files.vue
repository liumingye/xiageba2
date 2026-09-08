<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { FileText, HardDrive, FileAudio, FileVideo, File } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";
import { useClipboard } from "@vueuse/core";
import { get, post, del, patch } from "~/utils/request";
import {
  formatSize,
  formatDate,
  isImage,
  isAudio,
  isVideo,
} from "~/utils/file";

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
  if (configs.value.length > 0 && !selectedConfigId.value && configs.value[0]) {
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
    toast.add({
      title: "加载文件列表失败",
      icon: "i-lucide-x",
      color: "error",
    });
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
    toast.add({
      title: "请选择要上传的文件",
      icon: "i-lucide-x",
      color: "error",
    });
    return;
  }
  if (!selectedConfigId.value) {
    toast.add({
      title: "请先选择存储配置",
      icon: "i-lucide-x",
      color: "error",
    });
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
      toast.add({
        title: data.message || "文件已存在，已跳过",
        icon: "i-lucide-info",
        color: "info",
      });
    } else {
      toast.add({
        title: "上传成功",
        icon: "i-lucide-check",
        color: "success",
      });
    }
    uploadFile.value = null;
    uploadPath.value = "";
    showUpload.value = false;
    await loadFiles();
  } catch (err: any) {
    toast.add({
      title: err?.response?.data?.message || "上传失败，请重试",
      icon: "i-lucide-x",
      color: "error",
    });
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
    toast.add({
      title: "删除成功",
      icon: "i-lucide-check",
      color: "success",
    });
    await loadFiles();
  } catch (err: any) {
    toast.add({
      title: err?.response?.data?.message || "删除失败，请重试",
      icon: "i-lucide-x",
      color: "error",
    });
  } finally {
    deletingKey.value = null;
  }
};

const { copy: copyText } = useClipboard();

const copyUrl = async (file: StorageFile) => {
  try {
    await copyText(file.url);
    toast.add({
      title: "链接已复制",
      icon: "i-lucide-check",
      color: "success",
    });
  } catch {
    toast.add({
      title: "复制失败",
      icon: "i-lucide-x",
      color: "error",
    });
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
    toast.add({
      title: "文件名不能为空",
      icon: "i-lucide-x",
      color: "error",
    });
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
    toast.add({
      title: "重命名成功",
      icon: "i-lucide-check",
      color: "success",
    });
    cancelRename();
    await loadFiles();
  } catch (err: any) {
    toast.add({
      title: err?.response?.data?.message || "重命名失败，请重试",
      icon: "i-lucide-x",
      color: "error",
    });
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
        <h2 class="text-lg font-medium">文件管理</h2>
        <div class="flex items-center gap-3">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-search"
            @click="handleSearch"
          >
            搜索
          </UButton>
          <UButton color="primary" icon="i-lucide-upload" @click="toggleUpload">
            上传
          </UButton>
        </div>
      </div>

      <div class="flex items-center gap-3 mb-3 justify-end">
        <USelect
          v-model="selectedConfigId"
          class="max-w-72"
          placeholder="请选择存储配置"
          :items="
            configs.map((cfg) => ({
              label: `${cfg.name} (${cfg.bucket})`,
              value: cfg.id,
            }))
          "
        />
        <UInput
          v-model="searchKeyword"
          type="text"
          placeholder="搜索文件名"
          class="flex-1 max-w-md"
          @keyup.enter="handleSearch"
        />
      </div>

      <UCard
        v-if="showUpload"
        :ui="{
          root: 'mb-4',
          body: 'flex flex-wrap items-end gap-4',
        }"
      >
        <div class="flex-1 min-w-50">
          <label class="block text-color-400 text-sm mb-2" for="file-upload"
            >选择文件 *</label
          >
          <UInput
            id="file-upload"
            type="file"
            accept="*"
            class="cursor-pointer w-full"
            @change="handleFileChange"
          />
        </div>
        <div class="flex-1 min-w-50">
          <label class="block text-color-400 text-sm mb-2" for="file-path"
            >上传路径（可选）</label
          >
          <UInput
            id="file-path"
            v-model="uploadPath"
            type="text"
            placeholder="例如：music/2026/"
            class="w-full"
          />
        </div>
        <div class="flex items-center gap-2">
          <UButton
            color="primary"
            icon="i-lucide-upload"
            :loading="isUploading"
            :disabled="isUploading || !uploadFile"
            @click="handleUpload"
          >
            {{ isUploading ? "上传中..." : "开始上传" }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-x"
            title="关闭"
            aria-label="关闭"
            @click="toggleUpload"
          />
        </div>
      </UCard>

      <UCard
        :ui="{
          body: 'p-4',
        }"
      >
        <!-- 加载中 -->
        <div v-if="isLoading" class="py-16 text-center">
          <Loader2 class="w-6 h-6 text-primary-500 animate-spin mx-auto" />
          <p class="text-color-500 text-sm mt-2">加载中...</p>
        </div>

        <!-- 未选择配置 -->
        <div v-else-if="!selectedConfigId" class="py-16 text-center">
          <HardDrive class="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <p class="text-color-500">请选择存储配置</p>
        </div>

        <!-- 空状态 -->
        <div v-else-if="files.length === 0" class="py-16 text-center">
          <FileText class="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <p class="text-color-500">暂无文件</p>
        </div>

        <!-- Grid 文件列表 -->
        <div
          v-else
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
        >
          <div
            v-for="file in files"
            :key="file.key"
            class="group bg-color-200 border border-color-300 rounded-xl overflow-hidden hover:border-color-500 transition-colors"
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
                class="w-10 h-10 text-color-300"
              />
              <FileVideo
                v-else-if="isVideo(file)"
                class="w-10 h-10 text-color-300"
              />
              <File v-else class="w-10 h-10 text-color-300" />

              <!-- 悬浮操作 -->
              <div
                class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
              >
                <UButton
                  variant="outline"
                  square
                  size="sm"
                  icon="i-lucide-copy"
                  title="复制链接"
                  aria-label="复制链接"
                  @click="copyUrl(file)"
                />
                <UButton
                  variant="outline"
                  square
                  size="sm"
                  icon="i-lucide-pencil"
                  title="重命名"
                  aria-label="重命名"
                  :disabled="deletingKey === file.key"
                  @click="startRename(file)"
                />
                <UButton
                  variant="outline"
                  square
                  size="sm"
                  icon="i-lucide-trash-2"
                  :loading="deletingKey === file.key"
                  :disabled="deletingKey === file.key"
                  title="删除"
                  aria-label="删除"
                  @click="handleDelete(file)"
                />
              </div>
            </div>

            <!-- 文件信息 -->
            <div class="p-2.5">
              <!-- 重命名输入框 -->
              <div
                v-if="renameTarget?.key === file.key"
                class="flex items-center gap-1"
              >
                <UInput
                  v-model="renameValue"
                  type="text"
                  class="flex-1"
                  @keyup.enter="confirmRename"
                  @keyup.esc="cancelRename"
                />
                <UButton
                  color="primary"
                  variant="ghost"
                  square
                  size="sm"
                  icon="i-lucide-check"
                  :loading="isRenaming"
                  :disabled="isRenaming"
                  title="确认"
                  aria-label="确认"
                  @click="confirmRename"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  square
                  size="sm"
                  icon="i-lucide-x"
                  title="取消"
                  aria-label="取消"
                  @click="cancelRename"
                />
              </div>
              <!-- 正常文件名 -->
              <template v-else>
                <p class="text-xs truncate" :title="file.name">
                  {{ file.name }}
                </p>
                <div class="flex items-center justify-between mt-1">
                  <span class="text-[10px] text-color-500">{{
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
          :current-page="currentPage"
          :total-pages="totalPages"
          :total="total"
          item-label="个文件"
          @page-change="onPageChange"
        />
      </UCard>
    </main>
  </div>
</template>
