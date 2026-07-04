import { Pool } from "pg";
import { buildTokens } from "#server/utils/jieba";
import { clearTreeSymbols } from "#server/utils/source";

/**
 * 批量重建所有 Source 记录的 searchVector（使用 jieba 分词）
 * 触发方式：POST /api/admin/source/rebuild-search
 */
export default defineEventHandler(async (event) => {
  // 仅管理员可用（admin-auth 中间件已统一校验）

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { all } = await readBody(event);

  try {
    // 取出所有记录
    const allSql = `WHERE "searchVector" IS NULL OR "searchVector" = ''`;
    const { rows } = await pool.query(`
      SELECT id, title, description, menu
      FROM "Source"
      ${all ? "" : allSql};`);
    const sources = rows as Array<{
      id: string;
      title: string;
      description: string;
      menu: string;
    }>;

    if (sources.length === 0) {
      return { success: true, updated: 0, message: "没有需要重建的记录" };
    }

    // 逐条重建 searchVector
    let updated = 0;
    let errors = 0;

    for (const s of sources) {
      const tokens = buildTokens(
        s.title || "",
        s.description || "",
        clearTreeSymbols(s.menu || ""),
      );
      try {
        await pool.query(
          `UPDATE "Source" SET "searchVector" = to_tsvector('simple', $1) WHERE id = $2`,
          [tokens, s.id],
        );
        updated++;
      } catch (err: any) {
        errors++;
      }
    }

    // 重建 GIN 索引（searchVector 内容变了，索引需要重新生成）
    await pool.query(`REINDEX INDEX "Source_searchVector_idx";`);

    return {
      success: true,
      updated,
      total: sources.length,
      errors,
    };
  } finally {
    await pool.end();
  }
});
