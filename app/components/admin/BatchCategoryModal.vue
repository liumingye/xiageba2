<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { NO_CATEGORY } from "~/utils/sourceCategory";

/**
 * 批量设置分类弹窗
 *
 * 只负责「选哪个分类」，真正的请求和刷新由父页面做 —— 它更清楚
 * 当前选中了哪些行、刷新哪个列表。
 */

interface CategoryOption {
  id: number | string;
  name: string;
}

const props = defineProps<{
  open: boolean;
  categories: CategoryOption[];
  /** 选中项数量，仅用于文案 */
  selectedCount: number;
  /** 请求进行中，禁用按钮并显示 loading */
  loading: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  /** 用户确认，带上所选分类的原始值（可能是 NO_CATEGORY 哨兵） */
  confirm: [cid: string];
}>();

const cid = ref<string>(NO_CATEGORY);

const categoryItems = computed(() => [
  { label: "无分类", value: NO_CATEGORY },
  ...props.categories.map((cat) => ({
    label: cat.name,
    value: String(cat.id),
  })),
]);

/** 每次打开都重置为「无分类」，避免沿用上一次的选择 */
watch(
  () => props.open,
  (open) => {
    if (open) cid.value = NO_CATEGORY;
  },
);

const close = () => emit("update:open", false);
</script>

<template>
  <UModal
    :open="open"
    title="批量设置分类"
    :dismissible="false"
    :ui="{ footer: 'justify-end' }"
    @update:open="(v: boolean) => !v && close()"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          将为选中的 {{ selectedCount }} 项资源设置以下分类：
        </p>
        <USelect
          v-model="cid"
          class="w-full"
          :items="categoryItems"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex gap-4">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="loading"
          @click="close"
        >
          取消
        </UButton>
        <UButton
          color="primary"
          :loading="loading"
          :disabled="loading"
          @click="emit('confirm', cid)"
        >
          {{ loading ? "设置中..." : "确定" }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
