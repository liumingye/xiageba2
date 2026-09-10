<script setup lang="ts">
import { Monitor, Moon, Palette, Sun } from "@lucide/vue";
import {
  type ColorModeValue,
  type FontSizeValue,
  type NeutralColor,
  type PrimaryColor,
  type RadiusValue,
} from "~/composables/useThemeConfig";

const {
  settings,
  primaryColors,
  neutralColors,
  radiusValues,
  colorModes,
  fontSizes,
  apply,
  reset,
  isDefaultTheme,
} = useThemeConfig();

const colorModeIcons: Record<ColorModeValue, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const colorModeLabels: Record<ColorModeValue, string> = {
  light: "浅色",
  dark: "深色",
  system: "系统",
};

const fontSizeLabels: Record<FontSizeValue, string> = {
  15: "小",
  16: "默认",
  17: "中",
  18: "大",
  20: "特大",
};

function selectPrimary(value: PrimaryColor) {
  apply({ primary: value });
}

function selectNeutral(value: NeutralColor) {
  apply({ neutral: value });
}

function selectRadius(value: RadiusValue) {
  apply({ radius: value });
}

function selectColorMode(value: ColorModeValue) {
  apply({ colorMode: value });
}

function selectFontSize(value: FontSizeValue) {
  apply({ fontSize: value });
}

function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function randomTheme() {
  apply({
    primary: pickRandom(primaryColors),
    neutral: pickRandom(neutralColors),
    radius: pickRandom(radiusValues),
  });
}
</script>

<template>
  <UPopover
    modal
    :content="{
      side: 'bottom',
      sideOffset: 8,
      collisionPadding: 8,
    }"
    :ui="{ content: 'p-4 max-h-[70vh] overflow-y-auto w-full' }"
  >
    <UTooltip ignoreNonKeyboardFocus text="主题设置">
      <UButton color="neutral" variant="ghost" square aria-label="主题设置">
        <Palette class="h-5 w-5" />
      </UButton>
    </UTooltip>

    <template #content="{ close }">
      <div class="space-y-6">
        <!-- Color Mode -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium">主题模式</span>
            <div class="flex items-center gap-1">
              <UButton
                v-if="!isDefaultTheme"
                color="neutral"
                variant="ghost"
                icon="i-lucide-rotate-ccw"
                aria-label="恢复默认"
                title="恢复默认"
                @click="reset"
              />
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-dices"
                aria-label="随机主题"
                title="随机主题"
                @click="randomTheme"
              />
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                aria-label="关闭"
                title="关闭"
                @click="close"
              />
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <UButton
              v-for="mode in colorModes"
              :key="mode"
              type="button"
              color="neutral"
              variant="outline"
              size="sm"
              block
              :class="{
                'ring-2 ring-primary-500': settings.colorMode === mode,
              }"
              @click="selectColorMode(mode)"
            >
              <span class="flex items-center gap-2 flex-1">
                <component :is="colorModeIcons[mode]" class="w-4 h-4" />
                <span>{{ colorModeLabels[mode] }}</span>
              </span>
            </UButton>
          </div>
        </section>

        <!-- Primary -->
        <section>
          <div class="flex items-center gap-1.5 mb-3 text-sm font-medium">
            <span>主色调</span>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <UButton
              v-for="color in primaryColors"
              :key="color"
              type="button"
              color="neutral"
              variant="outline"
              size="sm"
              block
              :class="{
                'ring-2 ring-primary-500': settings.primary === color,
              }"
              @click="selectPrimary(color)"
            >
              <span class="flex items-center gap-2 flex-1">
                <span
                  class="w-3 h-3 rounded-full"
                  :class="[
                    color === 'black'
                      ? 'bg-black dark:bg-white'
                      : 'bg-(--color-light) dark:bg-(--color-dark)',
                  ]"
                  :style="{
                    '--color-light': `var(--color-${color}-500)`,
                    '--color-dark': `var(--color-${color}-400)`,
                  }"
                />
                <span class="capitalize">{{ color }}</span>
              </span>
            </UButton>
          </div>
        </section>

        <!-- Neutral -->
        <section>
          <div class="flex items-center gap-1.5 mb-3 text-sm font-medium">
            <span>中性灰色调</span>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <UButton
              v-for="color in neutralColors"
              :key="color"
              type="button"
              color="neutral"
              variant="outline"
              size="sm"
              block
              :class="{
                'ring-2 ring-primary-500': settings.neutral === color,
              }"
              @click="selectNeutral(color)"
            >
              <span class="flex items-center gap-2 flex-1">
                <span
                  class="w-3 h-3 rounded-full bg-(--color-light) dark:bg-(--color-dark)"
                  :style="{
                    '--color-light': `var(--color-${color}-500)`,
                    '--color-dark': `var(--color-${color}-400)`,
                  }"
                />
                <span class="capitalize">{{ color }}</span>
              </span>
            </UButton>
          </div>
        </section>

        <!-- Font Size -->
        <section>
          <div class="flex items-center gap-1.5 mb-3 text-sm font-medium">
            <span>文字大小</span>
          </div>
          <div class="grid grid-cols-5 gap-2">
            <UButton
              v-for="value in fontSizes"
              :key="value"
              type="button"
              color="neutral"
              variant="outline"
              size="sm"
              block
              :class="{
                'ring-2 ring-primary-500': settings.fontSize === value,
              }"
              @click="selectFontSize(value)"
            >
              <span>{{ fontSizeLabels[value] }}</span>
            </UButton>
          </div>
        </section>

        <!-- Radius -->
        <section>
          <div class="flex items-center gap-1.5 mb-3 text-sm font-medium">
            <span>圆角大小</span>
          </div>
          <div class="grid grid-cols-5 gap-2">
            <UButton
              v-for="value in radiusValues"
              :key="value"
              type="button"
              color="neutral"
              variant="outline"
              size="sm"
              block
              :class="{
                'ring-2 ring-primary-500': settings.radius === value,
              }"
              @click="selectRadius(value)"
            >
              <span>{{ value }}</span>
            </UButton>
          </div>
        </section>
      </div>
    </template>
  </UPopover>
</template>
