<script setup lang="ts">
import { Check, ChevronDown, ListFilter } from "@lucide/vue";
import { onClickOutside } from "@vueuse/core";

interface MultiSelectComboboxOption {
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

const comboboxRef = ref<HTMLDetailsElement | null>(null);

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

const close = () => {
  if (comboboxRef.value) comboboxRef.value.open = false;
};

const toggle = (value: string) => {
  const selected = new Set(props.modelValue);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  emit("update:modelValue", [...selected]);
  close();
};

const clear = () => {
  emit("update:modelValue", []);
  close();
};

onClickOutside(comboboxRef, close);

const handleFocusOut = (event: FocusEvent) => {
  const nextTarget = event.relatedTarget;
  if (
    comboboxRef.value &&
    nextTarget instanceof Node &&
    !comboboxRef.value.contains(nextTarget)
  ) {
    close();
  }
};
</script>

<template>
  <details
    ref="comboboxRef"
    class="group relative"
    @focusout="handleFocusOut"
    @keydown.esc.prevent="close"
  >
    <summary
      class="list-none w-full flex items-center justify-between gap-2 bg-gray-800 text-gray-300 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
      :aria-label="ariaLabel"
    >
      <span class="flex items-center gap-1.5 truncate">
        <ListFilter class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        {{ summary }}
      </span>
      <ChevronDown
        class="w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-180"
      />
    </summary>

    <div
      class="absolute left-0 top-full z-20 mt-1 w-full min-w-36 rounded-lg border border-gray-700 bg-gray-800 p-1.5 shadow-xl"
      role="listbox"
      :aria-label="ariaLabel"
      aria-multiselectable="true"
    >
      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-gray-300 hover:bg-gray-700"
        role="option"
        :aria-selected="modelValue.length === 0"
        @click="clear"
      >
        <span>{{ clearLabel }}</span>
      </button>

      <label
        v-for="option in options"
        :key="option.value"
        class="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-gray-300 hover:bg-gray-700"
        role="option"
        :aria-selected="modelValue.includes(option.value)"
      >
        <span>{{ option.label }}</span>
        <input
          class="sr-only"
          type="checkbox"
          :checked="modelValue.includes(option.value)"
          @change="toggle(option.value)"
        />
        <span
          class="flex h-4 w-4 items-center justify-center rounded border"
          :class="
            modelValue.includes(option.value)
              ? 'border-primary-500 bg-primary-500 text-white'
              : 'border-gray-600 text-transparent'
          "
          aria-hidden="true"
        >
          <Check class="h-3 w-3" />
        </span>
      </label>
    </div>
  </details>
</template>
