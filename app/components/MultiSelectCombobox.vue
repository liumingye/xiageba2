<script setup lang="ts">
import { ChevronDown, ListFilter } from "@lucide/vue";

export interface MultiSelectComboboxOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: readonly string[];
    options: readonly MultiSelectComboboxOption[];
    placeholder?: string;
    clearLabel?: string;
    ariaLabel?: string;
  }>(),
  {
    placeholder: "全部",
    clearLabel: "清空选择",
    ariaLabel: "选择选项",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const open = ref(false);

const summary = computed(() => {
  if (props.modelValue.length === 0) return props.placeholder;
  if (props.modelValue.length === 1) {
    return (
      props.options.find((option) => option.value === props.modelValue[0])
        ?.label || props.placeholder
    );
  }
  return `已选 ${props.modelValue.length} 项`;
});

const toggle = (value: string) => {
  const selected = new Set(props.modelValue);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  emit("update:modelValue", [...selected]);
};

const close = () => {
  open.value = false;
};

const clear = () => {
  emit("update:modelValue", []);
  close();
};

// 保持原有交互：点选/取消后收起菜单；选中项以菜单内对勾体现
const items = computed(() => {
  const optionItems = props.options.map((option) => ({
    label: option.label,
    type: "checkbox" as const,
    checked: props.modelValue.includes(option.value),
    onUpdateChecked: () => {
      toggle(option.value);
      // 同步关闭菜单（onSelect 自行关闭时此处为幂等操作）
      nextTick(() => {
        close();
      });
    },
  }));

  return [
    [
      {
        label: props.clearLabel,
        onSelect: clear,
      },
    ],
    optionItems,
  ];
});
</script>

<template>
  <UDropdownMenu
    v-model:open="open"
    :items="items"
    :content="{ align: 'start', side: 'bottom', sideOffset: 6 }"
    :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      color="neutral"
      variant="outline"
      :ui="{
        base: 'justify-between',
        leadingIcon: 'size-3',
      }"
      :aria-label="ariaLabel"
      size="lg"
      icon="i-lucide-filter"
      trailing-icon="i-lucide-chevron-down"
    >
      <span class="text-left flex-1 truncate">
        {{ summary }}
      </span>
    </UButton>
  </UDropdownMenu>
</template>
