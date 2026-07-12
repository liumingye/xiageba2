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

  const cid = Number(cidField) || null;
  const hasHeader = hasHeaderField === "true";

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
  if (!sheetName) {
    throw createError({ statusCode: 400, message: "SheetName 为空" });
  }
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw createError({ statusCode: 400, message: "Excel 文件为空" });
  }

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  if (!rawRows.length) {
    throw createError({ statusCode: 400, message: "Excel 文件为空" });
  }

  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  const rows: ImportRow[] = [];
  for (const row of dataRows) {
    const title = String(row[0] ?? "").trim();
    const url = String(row[1] ?? "").trim();
    if (!title || !url) continue;
    rows.push({ title, url });
  }

  if (!rows.length) {
    throw createError({ statusCode: 400, message: "未找到有效的资源数据" });
  }

  // 查询已存在的 URL
  const existingSources = await prisma.source.findMany({
    where: {
      url: { in: rows.map((r) => r.url) },
    },
    select: { url: true },
  });
  const existingUrls = new Set(existingSources.map((s) => s.url));

  const toInsert = rows.filter((r) => !existingUrls.has(r.url));
  const duplicateCount = rows.length - toInsert.length;

  let insertedCount = 0;
  for (const row of toInsert) {
    try {
      const source = await prisma.source.create({
        data: {
          cid,
          title: row.title,
          url: row.url,
          description: "",
          menu: "",
        },
      });

      const tokens = buildTokens(
        source.title || "",
        source.description || "",
        clearTreeSymbols(source.menu || ""),
      );
      if (tokens) {
        await prisma.$executeRaw`UPDATE "Source" SET "searchVector" = to_tsvector('simple', ${tokens}) WHERE id = ${source.id}`;
      }

      insertedCount++;
    } catch (e: any) {
      // 单条失败继续处理下一条
      console.error("[source import] insert failed:", row.url, e.message);
    }
  }

  return {
    success: true,
    total: rows.length,
    inserted: insertedCount,
    duplicate: duplicateCount,
    failed: toInsert.length - insertedCount,
  };
});
