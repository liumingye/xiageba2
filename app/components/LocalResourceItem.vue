<script setup lang="ts">
import {
  CheckCircle,
  XCircle,
  Loader2,
  Folder,
  Download,
  Calendar,
} from "@lucide/vue";
import { getTypeName } from "~/utils";

export interface SourceItem {
  id: string;
  title: string;
  type: string;
  menu: string;
  // description: string;
  createdAt: string;
}

defineProps<{
  item: SourceItem;
  checkStatus?: "valid" | "invalid" | "checking" | null;
  highlightHtml?: string;
  highlightMenu?: string;
}>();

const emit = defineEmits<{
  clickTitle: [item: SourceItem];
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
        <h3
          class="text-white hover:text-primary-400 cursor-pointer flex items-center gap-2"
          @click="emit('clickTitle', item)"
        >
          <span
            class="min-w-0 break-all"
            v-if="highlightHtml"
            v-html="highlightHtml"
          />
          <template v-else>{{ item.title }}</template>
        </h3>
        <div class="flex gap-2">
          <div
            class="bg-primary-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
          >
            <img
              v-if="item.type !== 'other'"
              :src="`/img/pan/${item.type}.png`"
              class="w-4 h-4 mr-1"
            />
            {{ getTypeName(item.type) }}网盘
          </div>
          <ClientOnly>
            <div
              v-if="checkStatus === 'valid'"
              class="bg-primary-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
            >
              <CheckCircle
                class="w-4 h-4 text-green-400 flex-shrink-0 mr-1"
              />链接有效
            </div>
            <div
              v-if="checkStatus === 'invalid'"
              class="bg-error-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
            >
              <XCircle
                class="w-4 h-4 text-red-300 flex-shrink-0 mr-1"
              />可能失效
            </div>
            <div
              v-if="checkStatus === 'checking'"
              class="bg-gray-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
            >
              <Loader2
                class="w-4 h-4 text-white animate-spin flex-shrink-0 mr-1"
              />正在检测
            </div>
          </ClientOnly>
        </div>
      </div>
      <template v-if="item.menu">
        <div class="text-sm mb-2 text-gray-300 font-bold">文件内容:</div>
        <pre
          class="bg-gray-700 p-2 rounded-sm text-xs border border-gray-600 max-h-36 overflow-auto text-gray-300"
          v-html="highlightMenu || item.menu"
        ></pre>
      </template>
    </div>
    <div
      class="flex justify-between items-center gap-2 border-t border-gray-700 mt-3 pt-3"
    >
      <span class="text-xs text-gray-500 flex items-center gap-1">
        <Calendar class="w-3 h-3" />
        {{ new Date(item.createdAt).toLocaleString("zh-CN") }}
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
