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
    <div class="text-sm text-color-400">
      共 {{ total }} {{ itemLabel || "条" }}
    </div>
    <div class="flex items-center gap-1">
      <button
        v-if="currentPage > 1"
        class="px-2 h-9 bg-color-100 hover:bg-primary-500 hover:text-white rounded text-sm transition-colors shadow-sm"
        @click="goToPage(currentPage - 1)"
      >
        <ChevronLeft class="w-4 h-4" />
      </button>
      <button
        v-for="p in getPageNumbers()"
        :key="p"
        class="h-9 rounded text-sm transition-colors shadow-sm disabled:pointer-events-none disabled:w-3"
        :class="
          p === '...'
            ? 'text-gray-400'
            : p === currentPage
              ? 'bg-primary-500 text-white px-2 min-w-9'
              : 'bg-color-100 hover:bg-primary-500 hover:text-white px-2 min-w-9'
        "
        @click="typeof p === 'number' && goToPage(p)"
        :disabled="p === '...'"
      >
        {{ p }}
      </button>

      <button
        v-if="currentPage < totalPages"
        class="px-2 h-9 bg-color-100 hover:bg-primary-500 hover:text-white rounded text-sm transition-colors shadow-sm"
        :disabled="currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      >
        <ChevronRight class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
