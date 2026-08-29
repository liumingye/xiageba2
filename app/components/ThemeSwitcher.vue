<script setup lang="ts">
import { Check, Monitor, Moon, Sun } from "@lucide/vue";
import { onClickOutside } from "@vueuse/core";
import type { Component } from "vue";
import type { ThemePreference } from "~/composables/useTheme";

const { preference, setTheme } = useTheme();

// 菜单 DOM 引用与展开状态
const menuRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: Component;
}

const options: Array<ThemeOption> = [
  { value: "auto", label: "跟随系统", icon: Monitor },
  { value: "light", label: "亮色", icon: Sun },
  { value: "dark", label: "暗色", icon: Moon },
];

const selectedOption = computed(
  () =>
    options.find((option) => option.value === preference.value) ||
    (options[0] as ThemeOption),
);

// 开关与关闭逻辑
const toggle = () => {
  isOpen.value = !isOpen.value;
};

const close = () => {
  isOpen.value = false;
};

const selectTheme = (value: ThemePreference) => {
  setTheme(value);
  close();
};

// 点击组件外部自动关闭
onClickOutside(menuRef, close);
</script>

<template>
  <div
    ref="menuRef"
    class="group z-30 relative inline-block"
    @keydown.esc.prevent="close"
  >
    <!-- 触发按钮 -->
    <button
      type="button"
      class="flex w-9 h-9 items-center justify-center rounded-lg cursor-pointer opacity-80 hover:opacity-100 hover:bg-color-300 transition-opacity"
      :aria-label="`当前主题：${selectedOption.label}`"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      title="切换主题"
      @click="toggle"
    >
      <ClientOnly>
        <component :is="selectedOption.icon" class="h-5 w-5" />
      </ClientOnly>
    </button>

    <!-- 下拉菜单内容 -->
    <ClientOnly>
      <Transition name="menu-fade">
        <div
          v-if="isOpen"
          class="absolute right-0 top-full mt-2 w-36 rounded-xl border border-color-300 bg-color-100 p-1.5 shadow-xl origin-top-right"
          role="menu"
          aria-label="主题"
        >
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm opacity-80 hover:opacity-100 hover:bg-color-300"
            role="menuitemradio"
            :aria-checked="preference === option.value"
            @click="selectTheme(option.value)"
          >
            <component :is="option.icon" class="h-4 w-4" />
            <span class="flex-1">{{ option.label }}</span>
            <Check
              class="h-3.5 w-3.5 text-primary-500 transition-opacity"
              :class="preference === option.value ? 'opacity-100' : 'opacity-0'"
            />
          </button>
        </div>
      </Transition>
    </ClientOnly>
  </div>
</template>

<style scoped>
/* 动画过程中的状态 */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

/* 隐藏时的初始与结束状态 */
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>