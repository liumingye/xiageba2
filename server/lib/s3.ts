import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "#server/lib/prisma";

interface S3ConfigRow {
  id: number;
  name: string;
  baseUrl: string;
  bucket: string;
  prefix: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

const clientCache = new Map<
  number,
  { client: S3Client; config: S3ConfigRow }
>();

export async function getS3Config(id: number): Promise<S3ConfigRow> {
  const config = await prisma.s3Config.findUnique({ where: { id } });
  if (!config || config.isHidden) {
    throw new Error("S3 配置不存在或已删除");
  }
  return config as S3ConfigRow;
}

export async function getS3Client(
  configId: number,
): Promise<{ client: S3Client; config: S3ConfigRow }> {
  const cached = clientCache.get(configId);
  if (cached) return cached;

  const config = await getS3Config(configId);

  const client = new S3Client({
    region: config.region || "auto",
    endpoint: config.endpoint || undefined,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true,
  });

  const entry = { client, config };
  clientCache.set(configId, entry);
  return entry;
}

/** 清除客户端缓存（配置更新/删除后调用） */
export function clearS3ClientCache(configId?: number) {
  if (configId !== undefined) {
    clientCache.delete(configId);
  } else {
    clientCache.clear();
  }
}

/** 拼接完整的对象 Key（含 prefix） */
export function getFullKey(config: S3ConfigRow, key: string): string {
  const prefix = config.prefix ? config.prefix.replace(/\/+$/, "") : "";
  return prefix ? `${prefix}/${key}` : key;
}

/**
 * 🔒 S3 对象 Key 安全校验：阻断路径穿越。
 *
 * S3 本身没有目录概念，Key 中的 `..` 不会被规范化，但可用来跳出
 * config.prefix 约定的命名空间，覆盖 / 删除同一 Bucket 下其它应用的
 * 对象（含前端直传、其它配置项写入的文件）。上传、删除、重命名三条
 * 写路径都必须先过这道校验。
 *
 * 注意：调用方传入的 Key 可能经过 decodeURIComponent 解码，
 * `%2e%2e%2f` 之流的编码探测在这里统一显形。
 */
export function assertSafeS3Key(key: string): string {
  const raw = String(key ?? "").trim();
  if (!raw) {
    throw createError({ statusCode: 400, message: "文件路径不能为空" });
  }
  // 统一为正斜杠视角，拒绝 Windows 风格分隔符混入
  const unified = raw.replace(/\\/g, "/");
  if (
    unified.split("/").includes("..") || // 路径穿越段
    unified.startsWith("/") || // 绝对路径
    /[\u0000-\u001f\u007f]/.test(unified) // 控制字符
  ) {
    throw createError({ statusCode: 400, message: "非法的文件路径" });
  }
  return unified;
}

/** 拼接文件访问 URL */
export function getFileUrl(config: S3ConfigRow, key: string): string {
  const fullKey = key;
  if (config.baseUrl) {
    const base = config.baseUrl.replace(/\/+$/, "");
    return `${base}/${fullKey}`;
  }
  const endpoint = config.endpoint.replace(/\/+$/, "");
  return `${endpoint}/${config.bucket}/${fullKey}`;
}

export interface S3FileItem {
  id: string;
  key: string;
  size: number;
  lastModified: string;
  url: string;
  name: string;
  mimeType: string;
}

/** 列出文件（从数据库查询） */
export async function listFiles(
  configId: number,
  options: { search?: string; page: number; pageSize: number },
): Promise<{
  data: S3FileItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { search, page, pageSize } = options;

  const where: Record<string, any> = {
    configId,
    isDeleted: false,
  };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { path: { contains: search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.storageFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.storageFile.count({ where }),
  ]);

  const data: S3FileItem[] = rows.map((r) => ({
    id: r.id,
    key: r.path,
    name: r.name,
    size: r.size,
    mimeType: r.mimeType,
    lastModified: r.createdAt.toISOString(),
    url: r.url,
  }));

  return { data, total, page, pageSize };
}

/** 上传文件：检测重复路径跳过，否则传 S3 + 写入 DB 记录 */
export async function uploadFile(
  configId: number,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<S3FileItem> {
  const safeKey = assertSafeS3Key(key);
  const { client, config } = await getS3Client(configId);
  const fullKey = getFullKey(config, safeKey);

  // 检测重复：同一配置下存在相同 path 的未删除记录则跳过
  const existing = await prisma.storageFile.findFirst({
    where: { configId, path: fullKey, isDeleted: false },
  });
  if (existing) {
    return {
      id: existing.id,
      key: existing.path,
      name: existing.name,
      size: existing.size,
      mimeType: existing.mimeType,
      lastModified: existing.createdAt.toISOString(),
      url: existing.url,
    };
  }

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: fullKey,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);

  const url = getFileUrl(config, fullKey);
  const name = key.split("/").pop() || key;

  const record = await prisma.storageFile.create({
    data: {
      configId,
      path: fullKey,
      name,
      size: body.byteLength,
      mimeType: contentType || "",
      url,
    },
  });

  return {
    id: record.id,
    key: record.path,
    name: record.name,
    size: record.size,
    mimeType: record.mimeType,
    lastModified: record.createdAt.toISOString(),
    url: record.url,
  };
}

/** 删除文件：先标记 DB 软删除，再调用 S3 删除 */
export async function deleteFile(
  configId: number,
  path: string,
): Promise<void> {
  const safePath = assertSafeS3Key(path);
  const { client, config } = await getS3Client(configId);

  // 根据 configId + path 找到记录并软删除
  const record = await prisma.storageFile.findFirst({
    where: { configId, path: safePath, isDeleted: false },
  });
  if (record) {
    await prisma.storageFile.update({
      where: { id: record.id },
      data: { isDeleted: true },
    });
  }

  // 同时从 S3 删除
  const command = new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: safePath,
  });

  await client.send(command);
}

/** 重命名文件：S3 复制到新 key + 删除旧 key，再更新 DB 记录 */
export async function renameFile(
  configId: number,
  oldPath: string,
  newName: string,
): Promise<S3FileItem> {
  const safeOldPath = assertSafeS3Key(oldPath);
  const { client, config } = await getS3Client(configId);

  const record = await prisma.storageFile.findFirst({
    where: { configId, path: safeOldPath, isDeleted: false },
  });
  if (!record) {
    throw new Error("文件记录不存在");
  }

  // 构建新路径：保留原目录，替换文件名
  const dir = safeOldPath.includes("/")
    ? safeOldPath.slice(0, safeOldPath.lastIndexOf("/") + 1)
    : "";
  const newPath = assertSafeS3Key(`${dir}${newName}`);

  // S3 复制到新 key（CopySource 需编码，避免中文等非 ASCII 字符导致 header 报错）
  const copyCommand = new CopyObjectCommand({
    Bucket: config.bucket,
    Key: newPath,
    CopySource: `${config.bucket}/${encodeURIComponent(safeOldPath)}`,
  });
  await client.send(copyCommand);

  // 删除旧 key
  const deleteCommand = new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: safeOldPath,
  });
  await client.send(deleteCommand);

  // 更新 DB
  const newUrl = getFileUrl(config, newPath);
  const updated = await prisma.storageFile.update({
    where: { id: record.id },
    data: {
      path: newPath,
      name: newName,
      url: newUrl,
    },
  });

  return {
    id: updated.id,
    key: updated.path,
    name: updated.name,
    size: updated.size,
    mimeType: updated.mimeType,
    lastModified: updated.createdAt.toISOString(),
    url: updated.url,
  };
}
