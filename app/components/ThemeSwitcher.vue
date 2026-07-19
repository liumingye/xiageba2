<script setup lang="ts">
import { Check, Monitor, Moon, Sun } from "@lucide/vue";
import { onClickOutside } from "@vueuse/core";
import type { Component } from "vue";
import type { ThemePreference } from "~/composables/useTheme";

const { preference, setTheme } = useTheme();
const menuRef = ref<HTMLDetailsElement | null>(null);

const options: Array<{
  value: ThemePreference;
  label: string;
  icon: Component;
}> = [
  { value: "system", label: "跟随系统", icon: Monitor },
  { value: "light", label: "亮色", icon: Sun },
  { value: "dark", label: "暗色", icon: Moon },
];

const selectedOption = computed(
  () => options.find((option) => option.value === preference.value) || options[0],
);

const close = () => {
  if (menuRef.value) menuRef.value.open = false;
};

const selectTheme = (value: ThemePreference) => {
  setTheme(value);
  close();
};

onClickOutside(menuRef, close);

const handleFocusOut = (event: FocusEvent) => {
  const nextTarget = event.relatedTarget;
  if (
    menuRef.value &&
    nextTarget instanceof Node &&
    !menuRef.value.contains(nextTarget)
  ) {
    close();
  }
};
</script>

<template>
  <details
    ref="menuRef"
    class="group z-30"
    @focusout="handleFocusOut"
    @keydown.esc.prevent="close"
  >
    <summary
      class="list-none flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-300 shadow-sm cursor-pointer hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
      :aria-label="`当前主题：${selectedOption.label}`"
      title="切换主题"
    >
      <component :is="selectedOption.icon" class="h-4 w-4" />
    </summary>

    <div
      class="absolute right-0 top-full mt-2 w-36 rounded-xl border border-gray-700 bg-gray-900 p-1.5 shadow-xl"
      role="menu"
      aria-label="主题"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-300 hover:bg-gray-800"
        role="menuitemradio"
        :aria-checked="preference === option.value"
        @click="selectTheme(option.value)"
      >
        <component :is="option.icon" class="h-4 w-4" />
        <span class="flex-1">{{ option.label }}</span>
        <Check
          class="h-3.5 w-3.5 text-primary-500"
          :class="preference === option.value ? 'opacity-100' : 'opacity-0'"
        />
      </button>
    </div>
  </details>
</template>
