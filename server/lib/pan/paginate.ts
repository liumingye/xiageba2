/**
 * 网盘分页聚合工具。
 *
 * 各厂商 SDK 的分页方式分两类：页码递增（夸克/UC、光鸭）与游标（迅雷 pageToken、
 * 百度 cursor）。调用方把 SDK 响应规范化为 { items, nextCursor }，这里只负责
 * 「拉满或到上限」的循环骨架。
 */

export interface PageResult<TItem, TCursor> {
  items: TItem[];
  /** 下一页游标；undefined 表示已到末页 */
  nextCursor?: TCursor;
}

/**
 * 聚合分页拉取
 * @param initialCursor 初始游标（页码型传起始页，游标型传初始 token）
 * @param fetchPage 拉取一页并规范化；返回空 items 或 null/undefined 即终止
 * @param maxPages 最多拉取页数（默认 5，防止超大目录打爆网盘 API）
 */
export async function paginate<TItem, TCursor>(
  initialCursor: TCursor,
  fetchPage: (
    cursor: TCursor,
  ) => Promise<PageResult<TItem, TCursor> | null | undefined>,
  maxPages = 5,
): Promise<TItem[]> {
  const result: TItem[] = [];
  let cursor = initialCursor;

  for (let page = 1; page <= maxPages; page++) {
    const pageResult = await fetchPage(cursor);
    if (!pageResult || pageResult.items.length === 0) break;
    result.push(...pageResult.items);
    if (pageResult.nextCursor === undefined) break;
    cursor = pageResult.nextCursor;
  }

  return result;
}
