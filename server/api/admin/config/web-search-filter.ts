import { createConfigKVHandler } from "#server/utils/admin";
import { initAutomaton_websearch_filter_keywords } from "#server/lib/simpleAC";

const CONFIG_KEYS = ["websearch_filter_keywords"];

// 保存后重建搜索过滤自动机，与旧实现的附加动作一致
export default createConfigKVHandler(CONFIG_KEYS, {
  afterSave: () => initAutomaton_websearch_filter_keywords(),
});
