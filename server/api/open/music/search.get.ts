import { searchMusicByKeyword } from "#server/lib/musicService";
import { paginated } from "#server/utils/admin";
import { parseOpenSearchQuery } from "#server/utils/openApi";

const MAX_KEYWORD_LENGTH = 64;

export default defineEventHandler(async (event) => {
  const { q, pagination } = parseOpenSearchQuery(getQuery(event), MAX_KEYWORD_LENGTH);
  const { data, total } = await searchMusicByKeyword({
    search: q,
    pagination,
    columns: "full",
    status: 1,
  });
  return paginated(data, total, pagination);
});
