import * as XLSX from "xlsx";
import { prisma } from "#server/lib/prisma";
import { clearTreeSymbols } from "#server/utils/source";
import { buildTokens } from "#server/utils/jieba";

interface ImportRow {
  title: string;
  url: string;
}

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event);
  if (!formData) {
    throw createError({ statusCode: 400, message: "请选择要导入的文件" });
  }

  const file = formData.find((item) => item.name === "file");
  if (!file || !file.data) {
    throw createError({ statusCode: 400, message: "请选择要导入的文件" });
  }

  const cidField = formData
    .find((item) => item.name === "cid")
    ?.data.toString();
  const hasHeaderField = formData
    .find((item) => item.name === "hasHeader")
    ?.data.toString();
  const isSelfField = formData
    .find((item) => item.name === "isSelf")
    ?.data.toString();

  const cid = Number(cidField) || null;
  const hasHeader = hasHeaderField === "true";
  const isSelf = isSelfField === "true";

  const mimeType = file.type || "";
  const filename = file.filename || "";
  const isXlsx =
    mimeType.includes("sheet") || filename.toLowerCase().endsWith(".xlsx");

  if (!isXlsx) {
    throw createError({ statusCode: 400, message: "仅支持 xlsx 格式文件" });
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.data, { type: "buffer" });
  } catch (e: any) {
    throw createError({
      statusCode: 400,
      message: `文件解析失败: ${e.message || "未知错误"}`,
    });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName)
    throw createError({ statusCode: 400, message: "SheetName 为空" });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet)
    throw createError({ statusCode: 400, message: "Excel 文件为空" });

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  if (!rawRows.length)
    throw createError({ statusCode: 400, message: "Excel 文件为空" });

  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  // 1. 内存清洗与过滤
  const rows: ImportRow[] = [];
  const incomingUrls = new Set<string>(); // 防单次 Excel 内部自带重复 URL

  for (const row of dataRows) {
    const title = String(row[0] ?? "").trim();
    const url = String(row[1] ?? "").trim();
    if (!title || !url || incomingUrls.has(url)) continue;

    incomingUrls.add(url);
    rows.push({ title, url });
  }

  if (!rows.length) {
    throw createError({ statusCode: 400, message: "未找到有效的资源数据" });
  }

  // 2. 批量查出数据库中已存在的 URL
  const targetUrls = rows.map((r) => r.url);
  const existingSources = await prisma.source.findMany({
    where: { url: { in: targetUrls } },
    select: { url: true },
  });
  const existingUrls = new Set(existingSources.map((s) => s.url));

  // 筛选真正需要插入的目标集合
  const toInsert = rows.filter((r) => !existingUrls.has(r.url));
  const duplicateCount = rows.length - toInsert.length;

  if (toInsert.length === 0) {
    return {
      success: true,
      total: rows.length,
      inserted: 0,
      duplicate: duplicateCount,
      failed: 0,
    };
  }

  let insertedCount = 0;

  // 3. 🚀 开启原子事务，处理高性能批量入库与批量索引更新
  try {
    await prisma.$transaction(
      async (tx) => {
        // Step A: 批量插入基础数据 (1 条 SQL 搞定)
        const payload = toInsert.map((r) => ({
          cid,
          title: r.title,
          url: r.url,
          description: "",
          menu: "",
          isSelf,
        }));

        await tx.source.createMany({
          data: payload,
          skipDuplicates: true, // 再次保障不因极极端并发冲突导致整批回滚
        });

        // Step B: 查回刚刚插入的这批数据的 ID 和必要字段，用于分词构建
        // （基于刚刚去重过的唯一 URL 集合查询，速度极快）
        const insertedRecords = await tx.source.findMany({
          where: { url: { in: toInsert.map((r) => r.url) } },
          select: { id: true, title: true, description: true, menu: true },
        });

        insertedCount = insertedRecords.length;

        // Step C: 内存高吞吐分词，构建批量合并更新所需要的数组
        const ids: string[] = [];
        const tokenStrings: string[] = [];

        for (const rec of insertedRecords) {
          const tokens = buildTokens(
            rec.title || "",
            rec.description || "",
            clearTreeSymbols(rec.menu || ""),
          );
          // 如果切词有内容，则加入批量更新列表
          if (tokens) {
            ids.push(rec.id);
            tokenStrings.push(tokens);
          }
        }

        // Step D: ⚡ 核心提速优化：采用 UNNEST 将成百上千次的全文索引更新压缩为 1 条 SQL 批量提交
        if (ids.length > 0) {
          await tx.$executeRaw`
          UPDATE "Source" as s
          SET "searchVector" = to_tsvector('simple', t.tokens)
          FROM (
            SELECT unnest(${ids}::text[]) as id, unnest(${tokenStrings}::text[]) as tokens
          ) as t
          WHERE s.id = t.id;
        `;
        }
      },
      {
        timeout: 30000, // 适当放宽事务超时时间到 30 秒，确保大批量写入安全完成
      },
    );
  } catch (err: any) {
    console.error("[Source Import Transaction Failed]:", err.message || err);
    throw createError({
      statusCode: 500,
      message: `批量导入发生严重异常，数据已自动回滚: ${err.message || "未知内核错误"}`,
    });
  }

  return {
    success: true,
    total: rows.length,
    inserted: insertedCount,
    duplicate: duplicateCount,
    failed: toInsert.length - insertedCount,
  };
});
