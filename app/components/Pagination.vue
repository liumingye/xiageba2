<script setup lang="ts">
defineOptions({
  name: "Pagination",
});

const props = defineProps<{
  currentPage: number;
  totalPages: number;
}>();

const emit = defineEmits<{
  (e: "change", page: number): void;
}>();

const current = computed(() => props.currentPage);
const total = computed(() => props.totalPages);

const pageNumbers = computed<(number | "...")[]>(() => {
  const pages: (number | "...")[] = [];
  if (total.value <= 7) {
    for (let i = 1; i <= total.value; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (current.value > 3) pages.push("...");
  const start = Math.max(2, current.value - 1);
  const end = Math.min(total.value - 1, current.value + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current.value < total.value - 2) pages.push("...");
  pages.push(total.value);
  return pages;
});

const goToPage = (page: number) => {
  if (page < 1 || page > total.value || page === current.value) return;
  emit("change", page);
};
</script>

<template>
  <div
    v-if="totalPages > 1"
    class="flex items-center justify-center gap-2 mt-8 flex-wrap"
    role="navigation"
    aria-label="分页"
  >
    <button
      v-if="currentPage > 1"
      class="px-2 h-9 bg-color-100 hover:bg-primary-500 hover:text-white rounded text-sm transition-colors shadow-sm"
      :disabled="currentPage <= 1"
      @click="goToPage(currentPage - 1)"
    >
      上一页
    </button>
    <template v-for="(p, idx) in pageNumbers" :key="idx">
      <button
        class="w-9 h-9 rounded text-sm transition-colors shadow-sm disabled:pointer-events-none disabled:w-3"
        :class="
          p === '...'
            ? ''
            : p === currentPage
              ? 'bg-primary-500 text-white'
              : 'bg-color-100 hover:bg-primary-500 hover:text-white'
        "
        @click="goToPage(p as number)"
        :disabled="p === '...'"
        :aria-current="p === currentPage ? 'page' : undefined"
      >
        {{ p }}
      </button>
    </template>
    <button
      v-if="currentPage < totalPages"
      class="px-2 h-9 bg-color-100 hover:bg-primary-500 hover:text-white rounded text-sm transition-colors shadow-sm"
      :disabled="currentPage >= totalPages"
      @click="goToPage(currentPage + 1)"
    >
      下一页
    </button>
  </div>
</template>
