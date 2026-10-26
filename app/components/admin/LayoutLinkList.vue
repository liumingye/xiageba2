<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowDown, ArrowUp, GripVertical, Plus } from "@lucide/vue";
import type {
  LayoutLinkItem,
  LayoutLinkSource,
  LayoutPreset,
  PageOption,
} from "~/utils/page";
import { newItemId } from "~/utils/page";

defineOptions({ name: "AdminLayoutLinkList" });

const props = withDefaults(
  defineProps<{
    modelValue: LayoutLinkItem[];
    title: string;
    hint?: string;
    /** 是否展示图标列与图标配置项（底部链接不需要；导航菜单图标为选填） */
    withIcon?: boolean;
    toPlaceholder?: string;
    /** 页面管理中已创建的页面，供「自定义页面」来源选择 */
    options?: PageOption[];
    /** 预设入口，由后台接口下发 */
    presets?: LayoutPreset[];
  }>(),
  {
    hint: "",
    withIcon: true,
    toPlaceholder: "如 /announcement 或 https://example.com",
    options: () => [],
    presets: () => [],
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: LayoutLinkItem[]];
}>();

const list = computed({
  get: () => props.modelValue || [],
  set: (value: LayoutLinkItem[]) => emit("update:modelValue", value),
});

/* ---------------- 表单 ---------------- */

const sourceItems = [
  { label: "自定义", value: "manual" },
  { label: "预设入口", value: "preset" },
  { label: "自定义页面", value: "page" },
];

type SelectItem = { label: string; value: string };

const presetItems = computed<SelectItem[]>(() =>
  (props.presets || []).map((p) => ({
    label: `${p.label}（${p.to}）`,
    value: p.key,
  })),
);

const pageItems = computed<SelectItem[]>(() =>
  (props.options || []).map((p) => ({
    label: `${p.title}（/page/${p.slug}）`,
    value: p.id,
  })),
);

const pageById = computed(() => {
  const map = new Map<string, PageOption>();
  for (const p of props.options || []) map.set(p.id, p);
  return map;
});

const showModal = ref(false);
const editingId = ref<string | null>(null);
const formSource = ref<LayoutLinkSource>("manual");
const formPresetKey = ref("");
const formPageId = ref("");
const formSlug = ref("");
const formLabel = ref("");
const formTo = ref("");
const formIcon = ref("link");
const formEnabled = ref(true);
const error = ref("");

const isEditing = computed(() => !!editingId.value);

const resetForm = () => {
  editingId.value = null;
  formSource.value = "manual";
  formPresetKey.value = "";
  formPageId.value = "";
  formSlug.value = "";
  formLabel.value = "";
  formTo.value = "";
  formIcon.value = "";
  formEnabled.value = true;
  error.value = "";
};

const openAdd = () => {
  resetForm();
  showModal.value = true;
};

const openEdit = (item: LayoutLinkItem) => {
  resetForm();
  editingId.value = item.id;
  formSource.value =
    item.source === "preset" || item.source === "page" ? item.source : "manual";
  formPresetKey.value = item.source === "preset" ? item.ref || "" : "";
  formPageId.value = item.source === "page" ? item.ref || "" : "";
  formSlug.value = item.slug || "";
  formLabel.value = item.label;
  formTo.value = item.to;
  formIcon.value = item.icon || "";
  formEnabled.value = item.enabled !== false;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

/** 切换来源：清空另一来源的选择，并给出合理默认值 */
const onSourceChange = (value: string) => {
  const source = (
    value === "preset" || value === "page" ? value : "manual"
  ) as LayoutLinkSource;
  formSource.value = source;
  error.value = "";
  if (source === "preset") {
    formPageId.value = "";
    formSlug.value = "";
    formTo.value = "";
    if (!formPresetKey.value)
      formPresetKey.value = presetItems.value[0]?.value || "";
    applyPreset();
  } else if (source === "page") {
    formPresetKey.value = "";
    formTo.value = "";
    if (!formPageId.value) formPageId.value = pageItems.value[0]?.value || "";
    applyPage();
  }
};

/** 选择预设：自动填写文案、链接与图标 */
const applyPreset = () => {
  const preset = (props.presets || []).find(
    (p) => p.key === formPresetKey.value,
  );
  if (!preset) return;
  formLabel.value = preset.label;
  formTo.value = preset.to;
  formIcon.value = preset.icon;
  error.value = "";
};

/** 选择页面：自动填写图标与 slug，文案留空则用页面标题 */
const applyPage = () => {
  const page = pageById.value.get(formPageId.value);
  if (!page) return;
  formLabel.value = page.title;
  formSlug.value = page.slug;
  formIcon.value = page.icon || "file-text";
  error.value = "";
};

const submit = () => {
  const label = formLabel.value.trim();
  const to = formTo.value.trim();
  const icon = formIcon.value.trim();

  if (formSource.value === "page") {
    const page = pageById.value.get(formPageId.value);
    if (!formPageId.value) {
      error.value = "请选择要关联的页面";
      return;
    }
    if (!page) {
      error.value = "所选页面不存在，请重新选择";
      return;
    }

    const payload: LayoutLinkItem = {
      id: editingId.value || newItemId(),
      label,
      to: "",
      icon,
      enabled: formEnabled.value,
      source: "page",
      ref: page.id,
      slug: page.slug,
    };

    const next = [...list.value];
    const index = next.findIndex((i) => i.id === editingId.value);
    if (index > -1) next[index] = payload;
    else next.push(payload);

    list.value = next;
    closeModal();
    return;
  }

  if (!label) {
    error.value = "显示文案不能为空";
    return;
  }
  if (!to) {
    error.value = "链接地址不能为空";
    return;
  }

  const payload: LayoutLinkItem = {
    id: editingId.value || newItemId(),
    label,
    to,
    icon,
    enabled: formEnabled.value,
    source: formSource.value === "preset" ? "preset" : "manual",
    ref: formSource.value === "preset" ? formPresetKey.value : "",
    slug: "",
  };

  const next = [...list.value];
  const index = next.findIndex((i) => i.id === editingId.value);
  if (index > -1) next[index] = payload;
  else next.push(payload);

  list.value = next;
  closeModal();
};

const removeItem = (item: LayoutLinkItem) => {
  if (!confirm(`确定要删除「${displayLabel(item)}」吗？`)) return;
  list.value = list.value.filter((i) => i.id !== item.id);
};

const move = (index: number, delta: number) => {
  const target = index + delta;
  if (target < 0 || target >= list.value.length) return;
  const next = [...list.value];
  const current = next[index];
  const swapped = next[target];
  if (!current || !swapped) return;
  next[index] = swapped;
  next[target] = current;
  list.value = next;
};

const toggleEnabled = (item: LayoutLinkItem) => {
  list.value = list.value.map((i) =>
    i.id === item.id ? { ...i, enabled: !i.enabled } : i,
  );
};

/* ---------------- 展示辅助 ---------------- */

/** 展示文案：自定义文案 → 页面标题 → slug */
const displayLabel = (item: LayoutLinkItem) => {
  if (item.source === "page") {
    const page = item.ref ? pageById.value.get(item.ref) : undefined;
    return item.label || page?.title || item.slug || "（页面已删除）";
  }
  return item.label || "（未填写文案）";
};

/** 展示图标：留空表示未配置图标 */
const displayIcon = (item: LayoutLinkItem) => item.icon || "";

/** 展示地址 */
const displayPath = (item: LayoutLinkItem) => {
  if (item.source === "page") {
    const page = item.ref ? pageById.value.get(item.ref) : undefined;
    const slug = page?.slug || item.slug;
    return slug ? `/page/${slug}` : "页面已删除";
  }
  return item.to || "（未填写链接）";
};

/** 来源标签 */
const sourceBadge = (item: LayoutLinkItem) => {
  if (item.source === "preset") return "预设";
  if (item.source === "page") return "页面";
  return "自定义";
};
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h3 class="text-base font-medium">{{ title }}</h3>
          <p v-if="hint" class="text-xs text-color-300 mt-1">{{ hint }}</p>
        </div>
        <UButton color="primary" variant="soft" size="sm" @click="openAdd">
          <Plus class="size-4" />
          新增
        </UButton>
      </div>
    </template>

    <div v-if="!list.length" class="py-8 text-center text-muted text-sm">
      暂无配置，点击右上角「新增」添加
    </div>

    <ul v-else class="divide-y divide-default">
      <li
        v-for="(item, index) in list"
        :key="item.id"
        class="flex items-center gap-3 py-2.5"
      >
        <GripVertical
          class="size-4 text-color-300 shrink-0"
          aria-hidden="true"
        />

        <div
          v-if="withIcon"
          class="size-9 shrink-0 rounded-lg border border-default flex items-center justify-center bg-elevated"
        >
          <UIcon
            v-if="displayIcon(item)"
            :name="`i-lucide-${displayIcon(item)}`"
            class="size-5 text-color-500"
          />
          <UIcon
            v-else
            name="i-lucide-image-off"
            class="size-5 text-color-500"
            title="未配置图标"
          />
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">
            {{ displayLabel(item) }}
            <UBadge
              v-if="sourceBadge(item) !== '自定义'"
              color="neutral"
              variant="soft"
              size="xs"
              class="ml-1"
            >
              {{ sourceBadge(item) }}
            </UBadge>
          </p>
          <p class="truncate text-xs text-color-300">{{ displayPath(item) }}</p>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <UButton
            color="neutral"
            variant="ghost"
            square
            size="sm"
            :icon="item.enabled === false ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :title="
              item.enabled === false ? '已停用，点击启用' : '已启用，点击停用'
            "
            :aria-label="item.enabled === false ? '启用' : '停用'"
            @click="toggleEnabled(item)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            square
            size="sm"
            :disabled="index === 0"
            title="上移"
            aria-label="上移"
            @click="move(index, -1)"
          >
            <ArrowUp class="size-4" />
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            square
            size="sm"
            :disabled="index === list.length - 1"
            title="下移"
            aria-label="下移"
            @click="move(index, 1)"
          >
            <ArrowDown class="size-4" />
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-pencil"
            title="编辑"
            aria-label="编辑"
            @click="openEdit(item)"
          />
          <UButton
            color="error"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-trash-2"
            title="删除"
            aria-label="删除"
            @click="removeItem(item)"
          />
        </div>
      </li>
    </ul>

    <UModal
      :open="showModal"
      :title="isEditing ? `编辑${title}` : `新增${title}`"
      :dismissible="false"
      @update:open="
        (v) => {
          if (!v) closeModal();
        }
      "
      :ui="{ content: 'max-w-xl', footer: 'justify-end' }"
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
            <label class="block text-color-400 text-sm mb-2" for="link-source">
              来源 *
            </label>
            <USelect
              id="link-source"
              :model-value="formSource"
              value-key="value"
              :items="sourceItems"
              class="w-full"
              @update:model-value="onSourceChange"
            />
            <p class="text-xs text-color-300 mt-1">
              选择「预设入口」或「自定义页面」会自动填写文案和链接
            </p>
          </div>

          <div v-if="formSource === 'preset'">
            <label class="block text-color-400 text-sm mb-2" for="link-preset">
              预设入口 *
            </label>
            <USelect
              id="link-preset"
              v-model="formPresetKey"
              value-key="value"
              :items="presetItems"
              placeholder="请选择预设入口"
              class="w-full"
              @update:model-value="applyPreset"
            />
            <p v-if="!presetItems.length" class="text-xs mt-1 text-color-300">
              预设入口加载中，请稍候或刷新页面
            </p>
          </div>

          <div v-else-if="formSource === 'page'">
            <label class="block text-color-400 text-sm mb-2" for="link-page">
              关联页面 *
            </label>
            <USelect
              id="link-page"
              v-model="formPageId"
              value-key="value"
              :items="pageItems"
              placeholder="请选择页面"
              class="w-full"
              @update:model-value="applyPage"
            />
            <p v-if="!pageItems.length" class="text-xs mt-1 text-color-300">
              尚未创建任何页面，请先到「页面管理」新增
            </p>
          </div>

          <div>
            <label class="block text-color-400 text-sm mb-2" for="link-label">
              显示文案{{ formSource === "page" ? "" : " *" }}
            </label>
            <UInput
              id="link-label"
              v-model="formLabel"
              :placeholder="
                formSource === 'page' ? '留空则使用页面标题' : '如 公告列表'
              "
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-color-400 text-sm mb-2" for="link-to">
              链接地址{{ formSource === "page" ? "" : " *" }}
            </label>
            <UInput
              v-if="formSource !== 'page'"
              id="link-to"
              v-model="formTo"
              :placeholder="toPlaceholder"
              class="w-full"
            />
            <UInput
              v-else
              id="link-to"
              :model-value="formSlug ? `/page/${formSlug}` : ''"
              disabled
              class="w-full"
            />
            <p v-if="formSource === 'page'" class="text-xs text-color-300 mt-1">
              由关联页面自动生成
            </p>
          </div>

          <div v-if="withIcon">
            <label class="block text-color-400 text-sm mb-2" for="link-icon">
              图标
            </label>
            <AdminIconPicker v-model="formIcon" input-id="link-icon" optional />
            <p class="text-xs text-color-300 mt-1">选填，留空则不展示图标</p>
          </div>

          <div class="flex items-center gap-2">
            <UCheckbox id="link-enabled" v-model="formEnabled" />
            <label class="text-color-300 text-sm" for="link-enabled">
              启用该条目
            </label>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex gap-4">
          <UButton color="neutral" variant="soft" @click="closeModal">
            取消
          </UButton>
          <UButton color="primary" @click="submit">
            {{ isEditing ? "保存" : "添加" }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UCard>
</template>
