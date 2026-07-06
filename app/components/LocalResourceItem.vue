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
  description: string;
  createdAt: string;
}

defineProps<{
  item: SourceItem;
  checkStatus?: "valid" | "invalid" | "checking" | null;
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
    :class="{
      'pointer-events-none': checkStatus === 'invalid',
    }"
    role="article"
  >
    <div
      v-if="checkStatus === 'invalid'"
      class="absolute inset-0 flex items-center justify-center bg-red-900/50 text-red-400 flex-shrink-0"
      title="链接失效"
    />
    <div class="flex flex-col">
      <div
        class="flex-1 min-w-0 flex justify-between gap-2 md:flex-row flex-col mb-2"
      >
        <h3
          class="text-white truncate hover:text-primary-400 cursor-pointer flex items-center gap-2"
          @click="emit('clickTitle', item)"
        >
          {{ item.title }}
          <CheckCircle
            v-if="checkStatus === 'valid'"
            class="w-4 h-4 text-green-400 flex-shrink-0"
            title="链接有效"
          />
          <XCircle
            v-if="checkStatus === 'invalid'"
            class="w-4 h-4 text-red-400 flex-shrink-0"
            title="链接失效"
          />
          <Loader2
            v-if="checkStatus === 'checking'"
            class="w-4 h-4 text-gray-400 animate-spin flex-shrink-0"
            title="检测中"
          />
        </h3>
        <div
          class="bg-primary-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center flex-shrink-0"
        >
          <img
            v-if="item.type !== 'other'"
            :src="`/img/pan/${item.type}.png`"
            class="w-4 h-4 mr-1"
          />
          {{ getTypeName(item.type) }}
        </div>
      </div>
      <template v-if="item.menu">
        <div class="text-sm mb-2 text-gray-300 font-bold">
          文件内容:
        </div>
        <pre
          class="bg-gray-700 p-2 rounded-sm text-sm border border-gray-600 max-h-36 overflow-auto text-gray-300"
          >{{ item.menu }}</pre
        >
      </template>
    </div>
    <div
      class="flex justify-between items-center gap-2 border-t border-gray-700 mt-3 pt-3"
    >
      <span class="text-xs text-gray-500 flex items-center gap-1">
        <Calendar class="w-3 h-3" />
        {{ new Date(item.createdAt).toLocaleString("zh-CN") }}
      </span>
      <div
        class="flex items-center gap-2"
        v-if="checkStatus !== 'invalid'"
      >
        <button
          v-if="
            !item.menu &&
            ['quark', 'baidu', 'uc', 'xunlei'].includes(item.type)
          "
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
