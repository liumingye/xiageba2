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

const handlePageChange = (page: number) => {
  if (page < 1 || page > props.totalPages || page === props.currentPage) return;
  emit("change", page);
};
</script>

<template>
  <UPagination
    v-if="totalPages > 1"
    class="mt-8 justify-center"
    :page="currentPage"
    :total="totalPages"
    :items-per-page="1"
    :ui="{
      list: 'flex-wrap justify-center',
    }"
    @update:page="handlePageChange"
  />
</template>
