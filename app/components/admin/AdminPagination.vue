<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "@lucide/vue";

const props = defineProps<{
  currentPage: number;
  totalPages: number;
  total: number;
  itemLabel?: string;
}>();

const emit = defineEmits<{
  (e: "page-change", page: number): void;
}>();

const goToPage = (page: number) => {
  if (page < 1 || page > props.totalPages) return;
  emit("page-change", page);
};

const getPageNumbers = (): (number | string)[] => {
  const pages: (number | string)[] = [];
  const total = props.totalPages;
  const current = props.currentPage;

  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
    return pages;
  }

  pages.push(1);

  if (current > 3) {
    pages.push("...");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
};
</script>

<template>
  <div
    v-if="totalPages > 1"
    class="flex items-center justify-between px-4 py-3"
  >
    <div class="text-sm text-gray-400">
      共 {{ total }} {{ itemLabel || "条" }}
    </div>
    <div class="flex items-center gap-1">
      <button
        :disabled="currentPage === 1"
        class="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        @click="goToPage(currentPage - 1)"
      >
        <ChevronLeft class="w-4 h-4" />
      </button>
      <button
        v-for="p in getPageNumbers()"
        :key="p"
        :class="[
          'min-w-[36px] h-8 px-2 text-sm rounded transition-colors',
          p === currentPage
            ? 'bg-primary-500 text-white'
            : p === '...'
              ? 'text-gray-500 cursor-default'
              : 'text-gray-400 hover:text-white',
        ]"
        @click="typeof p === 'number' && goToPage(p)"
      >
        {{ p }}
      </button>
      <button
        :disabled="currentPage === totalPages"
        class="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        @click="goToPage(currentPage + 1)"
      >
        <ChevronRight class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
