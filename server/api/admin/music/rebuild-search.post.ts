import { Pool } from "pg";
import { buildTokens } from "#server/utils/jieba";

/**
 * 批量重建所有 Music 记录的 searchVector（使用 jieba 分词）
 * 触发方式：POST /api/admin/music/rebuild-search
 */
export default defineEventHandler(async (event) => {
  // 仅管理员可用（admin-auth 中间件已统一校验）

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 取出所有记录
    const { rows } = await pool.query(`
      SELECT id, title, artist, album
      FROM "Music"
      WHERE "searchVector" IS NULL OR "searchVector" = '';`);
    const musics = rows as Array<{
      id: string;
      title: string;
      artist: string;
      album: string;
    }>;

    if (musics.length === 0) {
      return { success: true, updated: 0, message: "没有需要重建的记录" };
    }

    // 逐条重建 searchVector
    let updated = 0;
    let errors = 0;

    for (const m of musics) {
      const tokens = buildTokens(m.title || "", m.artist || "", m.album || "");
      try {
        await pool.query(
          `UPDATE "Music" SET "searchVector" = to_tsvector('simple', $1) WHERE id = $2`,
          [tokens, m.id],
        );
        updated++;
      } catch (err: any) {
        errors++;
      }
    }

    // 重建 GIN 索引（searchVector 内容变了，索引需要重新生成）
    await pool.query(`REINDEX INDEX "Music_searchVector_idx";`);

    return {
      success: true,
      updated,
      total: musics.length,
      errors,
    };
  } finally {
    await pool.end();
  }
});
