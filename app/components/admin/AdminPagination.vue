<script setup lang="ts">
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
</script>

<template>
  <div
    v-if="totalPages > 1"
    class="flex items-center justify-between gap-4 px-4 py-3"
  >
    <div class="text-sm text-color-400 shrink-0">
      共 {{ total }} {{ itemLabel || "条" }}
    </div>
    <UPagination
      :page="currentPage"
      :total="totalPages"
      :items-per-page="1"
      :ui="{
        list: 'flex-wrap',
      }"
      @update:page="goToPage"
    />
  </div>
</template>
