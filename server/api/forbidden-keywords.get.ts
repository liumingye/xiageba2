import { websearch_filter_keywords_list } from "#server/lib/simpleAC";

export default defineEventHandler(() => {
  return {
    data: websearch_filter_keywords_list,
    total: websearch_filter_keywords_list.length,
  };
});
