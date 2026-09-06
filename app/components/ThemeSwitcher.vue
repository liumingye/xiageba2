<script setup lang="ts">
import { Check, HelpCircle, Monitor, Moon, Palette, Sun } from "@lucide/vue";
import type {
  ColorModeValue,
  NeutralColor,
  PrimaryColor,
  RadiusValue,
} from "~/composables/useThemeConfig";

const {
  settings,
  primaryColors,
  neutralColors,
  radiusValues,
  colorModes,
  apply,
} = useThemeConfig();

const colorModeIcons: Record<ColorModeValue, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const colorModeLabels: Record<ColorModeValue, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
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
</script>

<template>
  <UPopover
    modal
    :content="{
      side: 'bottom',
      align: 'end',
      sideOffset: 8,
      collisionPadding: 8,
    }"
    :ui="{ content: 'p-4 w-[320px] max-h-[70vh] overflow-y-auto' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      square
      aria-label="主题设置"
      title="主题设置"
    >
      <Palette class="h-5 w-5" />
    </UButton>

    <template #content="{ close }">
      <div class="space-y-6">
        <!-- Color Mode -->
        <section>
          <div
            class="flex items-center gap-1.5 mb-3 text-sm font-medium justify-between"
          >
            <span>主题模式</span>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              @click="close"
            />
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
              <Check
                v-if="settings.primary === color"
                class="w-3.5 h-3.5 ml-auto text-primary-500"
              />
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
              <Check
                v-if="settings.neutral === color"
                class="w-3.5 h-3.5 ml-auto text-primary-500"
              />
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
