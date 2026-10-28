<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { post } from "~/utils/request";
import { getApiErrorMessage } from "~/utils/apiError";
import { NO_CATEGORY, toApiCid } from "~/utils/sourceCategory";

/**
 * 资源导入弹窗
 *
 * 上传 Excel、选分类、选重复策略，然后在弹窗内展示导入结果。
 * 状态完全自持，父页面只需要知道「打开了没」和「导完了」。
 */

interface CategoryOption {
  id: number | string;
  name: string;
}

const props = defineProps<{
  open: boolean;
  categories: CategoryOption[];
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  /** 导入成功，父页面据此刷新列表 */
  imported: [];
}>();

const toast = useToast();

const cid = ref<string>(NO_CATEGORY);
const hasHeader = ref(true);
const isSelf = ref(false);
const strategy = ref<"skip" | "update">("skip");
const file = ref<File | null>(null);
const result = ref<{
  success: boolean;
  total: number;
  inserted: number;
  updated?: number;
  duplicate: number;
  failed: number;
  message?: string;
} | null>(null);
const importing = ref(false);
const error = ref("");

const categoryItems = computed(() => [
  { label: "无分类", value: NO_CATEGORY },
  ...props.categories.map((cat) => ({
    label: cat.name,
    value: String(cat.id),
  })),
]);

/** 每次打开都回到干净的初始态，避免带着上一次的文件和结果 */
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    cid.value = NO_CATEGORY;
    hasHeader.value = true;
    isSelf.value = false;
    strategy.value = "skip";
    file.value = null;
    result.value = null;
    error.value = "";
  },
);

const close = () => emit("update:open", false);

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  file.value = target.files?.[0] || null;
  result.value = null;
};

const submit = async () => {
  if (!file.value) {
    error.value = "请选择要导入的 Excel 文件";
    return;
  }

  importing.value = true;
  error.value = "";
  result.value = null;

  try {
    const formData = new FormData();
    formData.append("file", file.value);
    formData.append("cid", toApiCid(cid.value));
    formData.append("hasHeader", String(hasHeader.value));
    formData.append("isSelf", String(isSelf.value));
    formData.append("strategy", strategy.value);

    const data = await post("/api/admin/source/import", formData);

    if (!data.success) {
      error.value = data.message || "导入失败";
      return;
    }

    result.value = data;
    const part =
      strategy.value === "update" && data.updated
        ? `，更新 ${data.updated} 条`
        : `，重复 ${data.duplicate} 条`;
    toast.add({
      title: `导入完成：成功 ${data.inserted} 条${part}，失败 ${data.failed} 条`,
      icon: "i-lucide-check",
      color: "success",
    });
    emit("imported");
  } catch (e: any) {
    error.value = getApiErrorMessage(e, "导入失败，请重试");
  } finally {
    importing.value = false;
  }
};
</script>

<template>
  <UModal
    :open="open"
    title="导入资源"
    :dismissible="false"
    :ui="{ footer: 'justify-end' }"
    @update:open="(v: boolean) => !v && close()"
  >
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="error"
        class="mb-4"
      />
      <div class="space-y-4">
        <div>
          <label class="block text-color-400 text-sm mb-2" for="import-cid"
            >资源分类</label
          >
          <USelect
            id="import-cid"
            v-model="cid"
            class="w-full"
            :items="categoryItems"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="import-file"
            >Excel 文件 *</label
          >
          <UInput
            id="import-file"
            type="file"
            accept=".xlsx"
            class="cursor-pointer w-full"
            @change="handleFileChange"
          />
          <p class="mt-2 text-color-500 text-xs">
            第一列为资源名称，第二列为资源地址，系统将自动去重后插入。
          </p>
        </div>
        <UCheckbox
          id="hasHeader"
          v-model="hasHeader"
          label="第一行为表头，跳过不导入"
        />
        <UCheckbox
          id="importIsSelf"
          v-model="isSelf"
          label="是自己的资源，搜索结果靠前"
        />
        <div>
          <label class="block text-color-400 text-sm mb-2" for="import-strategy"
            >重复资源处理</label
          >
          <USelect
            id="import-strategy"
            v-model="strategy"
            class="w-full"
            :items="[
              { label: '跳过添加重复资源', value: 'skip' },
              { label: '更新原有资源信息', value: 'update' },
            ]"
          />
          <p class="mt-2 text-color-500 text-xs">
            当 Excel
            中的地址已存在时，选择“跳过”则忽略该条；选择“更新”则会覆盖原有资源的名称、分类与
            isSelf 标记。
          </p>
        </div>
        <UAlert
          v-if="result"
          color="success"
          variant="soft"
          icon="i-lucide-check"
        >
          <template #title>导入完成</template>
          共解析 {{ result.total }} 条，成功导入
          {{ result.inserted }} 条
          <template v-if="result.updated">
            ，更新 {{ result.updated }} 条
          </template>
          ，重复 {{ result.duplicate }} 条，失败 {{ result.failed }} 条。
        </UAlert>
      </div>
    </template>
    <template #footer>
      <div class="flex gap-4">
        <UButton color="neutral" variant="soft" @click="close">取消</UButton>
        <UButton
          color="primary"
          :loading="importing"
          :disabled="importing || !file"
          @click="submit"
        >
          {{ importing ? "导入中..." : "开始导入" }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
