<script setup lang="ts">
import {
  CheckCircle,
  XCircle,
  Loader2,
  Folder,
  Download,
  Calendar,
} from "@lucide/vue";
import { getStorageTypeFriendFromFilter, type PanFilter } from "#shared/utils";
import { type CheckStatus } from "@/composables/usePanCheck";

export interface SourceItem {
  id: string;
  title: string;
  type: PanFilter;
  menu: string;
  isSelf?: boolean;
  // description: string;
  createdAt: string;
}

defineProps<{
  item: SourceItem;
  checkStatus?: CheckStatus;
  highlightHtml?: string;
  highlightMenu?: string;
}>();

const emit = defineEmits<{
  openTree: [item: SourceItem];
  openModal: [item: SourceItem];
}>();
</script>

<template>
  <article
    class="relative card p-3 hover:border-primary-500/50 transition-colors"
    role="article"
  >
    <div
      v-if="checkStatus === 'invalid'"
      class="absolute inset-0 bg-red-900/10 pointer-events-none"
    />
    <div class="flex flex-col">
      <div class="flex-1 min-w-0 flex gap-2 mb-2 flex-col">
        <NuxtLink
          :to="`/source/${item.id}`"
          class="text-white hover:text-primary-400 cursor-pointer flex items-center gap-2"
        >
          <span
            class="min-w-0 break-all"
            v-if="highlightHtml"
            v-html="highlightHtml"
          />
          <template v-else>{{ item.title }}</template>
        </NuxtLink>
        <div class="flex gap-2">
          <div
            class="dark:bg-zinc-800 bg-zinc-700 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
          >
            <div
              v-if="item.type !== 'other'"
              :class="`icon-${item.type} w-4 h-4 mr-1`"
            ></div>
            {{ getStorageTypeFriendFromFilter(item.type) }}网盘
          </div>
          <div
            v-if="item.isSelf"
            class="bg-gradient-to-br from-amber-900 to-orange-500 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
          >
            独家精选
          </div>
          <ClientOnly>
            <div
              v-if="checkStatus === 'valid'"
              class="dark:bg-primary-800 bg-primary-600 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
            >
              <CheckCircle
                class="w-4 h-4 text-[var(--white)] flex-shrink-0 mr-1"
              />链接有效
            </div>
            <div
              v-if="checkStatus === 'invalid'"
              class="bg-error-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
            >
              <XCircle
                class="w-4 h-4 text-[var(--white)] flex-shrink-0 mr-1"
              />可能失效
            </div>
            <div
              v-if="checkStatus === 'checking'"
              class="dark:bg-zinc-800 bg-zinc-700 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
            >
              <Loader2
                class="w-4 h-4 text-white animate-spin flex-shrink-0 mr-1"
              />正在检测
            </div>
          </ClientOnly>
        </div>
      </div>
      <template v-if="item.menu">
        <div class="text-sm mb-2 text-zinc-300 font-bold">文件内容:</div>
        <pre
          v-if="highlightMenu"
          class="bg-zinc-700 p-2 rounded-sm text-xs border border-zinc-600 max-h-36 overflow-auto text-zinc-300"
          v-html="highlightMenu"
        ></pre>
        <pre
          v-else
          class="bg-zinc-700 p-2 rounded-sm text-xs border border-zinc-600 max-h-36 overflow-auto text-zinc-300"
          >{{ item.menu }}</pre
        >
      </template>
    </div>
    <div
      class="flex justify-between items-center gap-2 border-t border-zinc-700 mt-3 pt-3"
    >
      <span class="text-xs text-zinc-500 flex items-center gap-1">
        <Calendar class="w-3 h-3" />
        <NuxtTime
          :datetime="item.createdAt"
          year="numeric"
          month="short"
          day="numeric"
          hour="numeric"
          minute="numeric"
          second="numeric"
        />
      </span>
      <div class="flex items-center gap-2">
        <button
          v-if="['quark', 'baidu', 'uc', 'xunlei'].includes(item.type)"
          class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
          @click.stop="emit('openTree', item)"
        >
          <Folder class="w-3 h-3" />
          目录
        </button>
        <button
          class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
          @click.stop="emit('openModal', item)"
        >
          <Download class="w-3 h-3" />
          获取链接
        </button>
      </div>
    </div>
  </article>
</template>
