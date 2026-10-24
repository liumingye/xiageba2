<script setup lang="ts">
import { computed, ref } from "vue";

defineOptions({ name: "AdminIconPicker" });

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    /** 输入框 id，便于 label 关联 */
    inputId?: string;
    placeholder?: string;
    /** 图标选填：为 true 时留空展示「未配置」占位，而不是默认图标预览 */
    optional?: boolean;
  }>(),
  {
    modelValue: "",
    inputId: "icon-picker-input",
    placeholder: "lucide 图标名，如 shield-alert",
    optional: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const model = computed({
  get: () => props.modelValue || "",
  set: (value: string) => emit("update:modelValue", value),
});

/** 常用 lucide 图标（kebab-case，配合 i-lucide- 前缀使用） */
const COMMON_ICONS = [
  "file-text",
  "shield-alert",
  "shield-ban",
  "shield-check",
  "lock",
  "key-round",
  "copyright",
  "file-signature",
  "megaphone",
  "book-open",
  "home",
  "info",
  "help-circle",
  "alert-triangle",
  "bell",
  "star",
  "heart",
  "tag",
  "users",
  "user",
  "settings",
  "wrench",
  "mail",
  "phone",
  "globe",
  "link",
  "external-link",
  "download",
  "upload",
  "search",
  "filter",
  "gift",
  "credit-card",
  "shopping-cart",
  "package",
  "truck",
  "calendar",
  "clock",
  "map-pin",
  "camera",
  "image",
  "music",
  "headphones",
  "video",
  "play-circle",
  "folder",
  "database",
  "cloud",
  "code",
  "terminal",
  "server",
  "eye",
  "edit",
  "trash-2",
  "plus",
  "check",
  "x",
  "arrow-right",
  "chevron-right",
  "list",
  "grid",
  "layers",
  "sparkles",
  "zap",
  "flame",
  "rocket",
  "award",
  "badge-check",
];

const showPanel = ref(false);

const pick = (name: string) => {
  model.value = name;
  showPanel.value = false;
};
</script>

<template>
  <div>
    <div class="flex items-center gap-2">
      <div
        class="size-9 shrink-0 rounded-lg border border-default flex items-center justify-center bg-elevated"
      >
        <UIcon
          v-if="model"
          :name="`i-lucide-${model}`"
          class="size-5 text-color-500"
        />
        <UIcon
          v-else
          :name="optional ? 'i-lucide-image-off' : 'i-lucide-file-text'"
          class="size-5"
          :class="optional ? 'text-color-300' : 'text-color-500'"
        />
      </div>
      <UInput
        :id="inputId"
        v-model="model"
        class="flex-1"
        :placeholder="placeholder"
      />
      <UButton
        color="neutral"
        variant="soft"
        :icon="showPanel ? 'i-lucide-chevron-up' : 'i-lucide-grid'"
        :aria-expanded="showPanel"
        aria-label="选择图标"
        @click="showPanel = !showPanel"
      >
        图标库
      </UButton>
    </div>

    <div
      v-if="showPanel"
      class="mt-2 p-2 border border-default rounded-lg bg-elevated max-h-48 overflow-y-auto"
    >
      <div class="grid grid-cols-8 sm:grid-cols-10 gap-1">
        <button
          v-for="name in COMMON_ICONS"
          :key="name"
          type="button"
          class="size-9 rounded-md flex items-center justify-center hover:bg-accented"
          :class="model === name ? 'bg-primary/10 ring-1 ring-primary' : ''"
          :title="name"
          :aria-label="name"
          @click="pick(name)"
        >
          <UIcon :name="`i-lucide-${name}`" class="size-5 text-color-500" />
        </button>
      </div>
    </div>
  </div>
</template>
