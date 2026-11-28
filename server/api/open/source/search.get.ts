import { searchSourcesByKeyword } from "#server/lib/sourceService";
import { paginated } from "#server/utils/admin";
import { parseOpenSearchQuery } from "#server/utils/openApi";

/** 资源搜索支持 URL 精准匹配，关键词上限放宽到 200 字符 */
const MAX_KEYWORD_LENGTH = 200;

export default defineEventHandler(async (event) => {
  const { q, pagination, cid } = parseOpenSearchQuery(getQuery(event), MAX_KEYWORD_LENGTH);
  const { data, total } = await searchSourcesByKeyword({
    keyword: q,
    cid,
    pagination,
    status: 1,
  });
  return paginated(data, total, pagination);
});
