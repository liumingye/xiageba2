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
      class="btn"
      :disabled="currentPage <= 1"
      @click="goToPage(currentPage - 1)"
    >
      上一页
    </button>
    <template v-for="(p, idx) in pageNumbers" :key="idx">
      <span v-if="p === '...'">
        {{ p }}
      </span>
      <button
        v-else
        class="btn"
        :class="{
          active: p === currentPage,
        }"
        @click="goToPage(p as number)"
        :aria-current="p === currentPage ? 'page' : undefined"
      >
        {{ p }}
      </button>
    </template>
    <button
      v-if="currentPage < totalPages"
      class="btn"
      :disabled="currentPage >= totalPages"
      @click="goToPage(currentPage + 1)"
    >
      下一页
    </button>
  </div>
</template>

<style scoped>
.btn {
  @apply rounded text-sm transition-colors shadow-sm h-9 border border-color-300 hover:text-white bg-color-100 hover:bg-primary-500 px-2 min-w-9;

  &.active {
    @apply border-transparent bg-primary-500 text-white px-2 min-w-9;
  }
}
</style>
