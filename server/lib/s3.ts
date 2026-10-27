import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "#server/lib/prisma";
import { withKeyLock } from "#server/lib/keyedLock";

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

/**
 * 把 AWS SDK 异常收敛成可日志化的摘要。
 *
 * 兼容对象存储（如 RustFS）经常不返回标准 XML 错误码，此时 SDK 的 err.name 是
 * "Unknown"、err.message 是 "UnknownError"，只有 $metadata.httpStatusCode 有信息量；
 * 原始异常对象直接打日志体积大且难以检索，这里统一抽取关键字段。
 */
function describeS3Error(err: any) {
  return {
    name: err?.name ?? "Unknown",
    statusCode: err?.$metadata?.httpStatusCode,
    requestId: err?.$metadata?.requestId,
    message: err?.message,
  };
}

/** 丢弃响应体时，最多等这么久；半死的连接不能挂住调用方 */
const BODY_DRAIN_TIMEOUT_MS = 5000;

/**
 * 丢弃响应体，但**最多只读一个 chunk**。
 *
 * 为什么不能直接 `transformToByteArray()`：那会把整个对象读进内存。虽然请求带了
 * `Range: bytes=0-0`，但忽略 Range 的兼容网关（或中间代理）会返回全量对象，
 * 一个 5G 文件就足以把进程打爆。这里只取首块（≤64KB）后立刻销毁，内存占用与
 * 对象体积无关。
 */
async function drainBody(body: any): Promise<void> {
  if (!body) return;

  const iterator =
    typeof body[Symbol.asyncIterator] === "function"
      ? body[Symbol.asyncIterator]()
      : null;

  if (iterator) {
    const timer = new Promise<void>((resolve) => {
      const t = setTimeout(resolve, BODY_DRAIN_TIMEOUT_MS);
      (t as unknown as { unref?: () => void }).unref?.();
    });
    // 只等首块到达，或等超时；两者先到为准
    await Promise.race([iterator.next().catch(() => {}), timer]);
    try {
      await iterator.return?.();
    } catch {
      /* 关闭流失败无所谓，下面还会 destroy */
    }
  }

  try {
    body.destroy?.();
  } catch {
    /* ignore */
  }
}

/**
 * 判断对象是否存在，返回 "yes" | "no" | "unknown"。
 *
 * 用 `GET Range: bytes=0-0`（只取 1 字节）而不是 HeadObject：实测本仓库对接的
 * RustFS 网关对「本进程此前没有 GET 过」的键，HEAD 稳定返回 403
 * （SDK 侧 name="Unknown" / message="UnknownError"），而同一个键的 GET 会正常
 * 返回 200 或 NoSuchKey/404 —— 也就是 HEAD 在这个 provider 上既不能证明存在、
 * 也不能证明不存在。因此这里只有明确 200 / 明确 404 才下结论，其余返回
 * "unknown" 由调用方按场景决定（破坏性操作必须 fail-closed）。
 */
async function probeObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<"yes" | "no" | "unknown"> {
  let res;
  try {
    res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-0" }),
    );
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
      return "no";
    }
    // 空对象 + Range: bytes=0-0 会返回 416：对象确实存在，只是没有内容可给
    if (status === 416 || err?.name === "InvalidRange") {
      return "yes";
    }
    console.warn("[S3] 对象存在性探测不可判定:", {
      key,
      ...describeS3Error(err),
    });
    return "unknown";
  }

  await drainBody(res.Body);
  return "yes";
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

  let record;
  try {
    record = await prisma.storageFile.create({
      data: {
        configId,
        path: fullKey,
        name,
        size: body.byteLength,
        mimeType: contentType || "",
        url,
      },
    });
  } catch (err: any) {
    // 并发上传同一个文件名时，唯一索引会拦下后到的那条：复用已存在的记录，
    // 并**绝不能**删对象——那是另一个请求的记录正在使用的文件。
    if (err?.code === "P2002") {
      const winner = await prisma.storageFile.findFirst({
        where: { configId, path: fullKey, isDeleted: false },
      });
      if (winner) return toFileItem(winner);
    }

    // 其余落库失败才补偿删除，且删之前确认没有活跃记录指向这个 key。
    const otherRef = await prisma.storageFile
      .findFirst({ where: { configId, path: fullKey, isDeleted: false } })
      .catch(() => undefined);

    if (otherRef === undefined) {
      console.error(
        "[S3] 上传后落库失败，且无法确认对象归属，已保留对象待人工清理:",
        { key: fullKey },
      );
    } else if (otherRef) {
      console.warn("[S3] 上传后落库失败，对象已被其它记录引用，跳过清理:", {
        key: fullKey,
        otherRefId: otherRef.id,
      });
    } else {
      await client
        .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: fullKey }))
        .catch((cleanupErr) => {
          console.error("[S3] 上传后落库失败，补偿删除对象也失败:", cleanupErr);
        });
    }
    throw err;
  }

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

  try {
    await client.send(command);
  } catch (err) {
    // 先把原始错误留在服务端日志，再抛可读状态给前端，避免 SDK 堆栈外泄。
    console.error("[S3] 删除对象失败:", {
      key: safePath,
      bucket: config.bucket,
      ...describeS3Error(err),
    });
    // S3 删除失败必须回滚软删除，否则文件仍在但后台再也看不到、也无法重试删除。
    if (record) {
      await prisma.storageFile
        .update({ where: { id: record.id }, data: { isDeleted: false } })
        .catch((rollbackErr) => {
          console.error("[S3] 删除失败，回滚软删除也失败:", rollbackErr);
        });
    }
    throw createError({
      statusCode: 502,
      message: "对象存储删除失败，详情见服务端日志",
    });
  }
}

/** renameFile 内部用到的记录字段（避免依赖 Prisma 生成类型的深层推导） */
interface StorageFileRecord {
  id: string;
  path: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  createdAt: Date;
}

/** 记录 → 对外返回的条目 */
function toFileItem(record: StorageFileRecord): S3FileItem {
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

/**
 * 重命名文件：S3 复制到新 key → 落库 → 删旧 key。
 *
 * 并发安全由两层保证：
 * 1. withKeyLock 把「目标 key 占用检查 + 复制 + 落库」串行化（单进程内有效）；
 * 2. StorageFile 上 (configId, path) WHERE isDeleted = false 的部分唯一索引兜住
 *    多进程 / 多副本（见 migration 20261027232000_add_storage_file_active_path_unique）。
 *    没有第一层时，第二个请求会撞唯一索引而不是覆盖；没有第二层时，多副本部署会漏。
 */
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
    throw createError({ statusCode: 404, message: "文件记录不存在" });
  }

  // 构建新路径：保留原目录，替换文件名
  const dir = safeOldPath.includes("/")
    ? safeOldPath.slice(0, safeOldPath.lastIndexOf("/") + 1)
    : "";
  const newPath = assertSafeS3Key(`${dir}${newName}`);

  if (newPath === safeOldPath) return toFileItem(record);

  try {
    return await withKeyLock(
      `s3:rename:${configId}:${newPath}`,
      () =>
        renameFileLocked({
          client,
          config,
          record,
          safeOldPath,
          newPath,
          newName,
        }),
      { waitMs: 30_000 },
    );
  } catch (err: any) {
    if (err?.code === "ELOCKTIMEOUT") {
      throw createError({
        statusCode: 409,
        message: "同名文件正在被另一个改名操作处理，请稍后重试",
      });
    }
    throw err;
  }
}

/** 在 key 锁内执行的改名主体：检查占用 → 复制 → 落库 → 删旧对象 */
async function renameFileLocked(args: {
  client: S3Client;
  config: S3ConfigRow;
  record: StorageFileRecord;
  safeOldPath: string;
  newPath: string;
  newName: string;
}): Promise<S3FileItem> {
  const { client, config, record, safeOldPath, newPath, newName } = args;

  // 目标 key 占用检查：DB 是权威依据（后台列表也只读 DB），对象层再兜一次底。
  const conflict = await prisma.storageFile.findFirst({
    where: { configId: config.id, path: newPath, isDeleted: false },
  });
  if (conflict) {
    throw createError({ statusCode: 409, message: "目标文件名已存在" });
  }

  const probe = await probeObject(client, config.bucket, newPath);
  if (probe === "yes") {
    throw createError({ statusCode: 409, message: "目标文件名已存在" });
  }
  // 破坏性操作必须 fail-closed：探测不出结果时若当作"不存在"放行，CopyObject
  // 会静默覆盖已存在的对象，事后没有任何痕迹可查。
  if (probe === "unknown") {
    throw createError({
      statusCode: 503,
      message: "无法确认目标文件名是否被占用，请稍后重试",
    });
  }

  // S3 复制到新 key。CopySource 逐段编码并保留字面 "/"：整路径 encodeURIComponent
  // 会把分隔符编成 %2F，AWS 规范写法要求保留 "/"（实测两种写法 RustFS 都能成功，
  // 取规范写法以免其它 provider 解析失败）。
  const copyCommand = new CopyObjectCommand({
    Bucket: config.bucket,
    Key: newPath,
    CopySource: `${config.bucket}/${safeOldPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  });
  try {
    await client.send(copyCommand);
  } catch (err: any) {
    console.error("[S3] 重命名：复制到新 key 失败:", {
      oldPath: safeOldPath,
      newPath,
      ...describeS3Error(err),
    });
    throw createError({
      statusCode: 502,
      message: "对象存储改名失败：复制对象未成功，详情见服务端日志",
    });
  }

  // 只记录、不阻断：本 provider 对新写入的键存在负缓存，复制成功后立刻回读
  // 仍可能拿到 404（实测同一目标键前两次判定为"未生成"、第三次正常）。
  // 此时对象其实已经复制到位，若据此抛错回滚，DB 留在旧路径而存储里多出一副本，
  // 反而制造孤儿文件，所以这里只留日志。
  const afterCopy = await probeObject(client, config.bucket, newPath);
  if (afterCopy !== "yes") {
    console.warn("[S3] 重命名：复制后回读未确认到新对象（可能是 provider 负缓存）:", {
      oldPath: safeOldPath,
      newPath,
      probe: afterCopy,
    });
  }

  // 先落库，成功后再删旧对象。若落库失败，清掉新副本即可完全回滚，
  // 不会出现「旧对象已删、DB 仍指向旧路径」的不可恢复状态。
  const newUrl = getFileUrl(config, newPath);
  let updated;
  try {
    updated = await prisma.storageFile.update({
      where: { id: record.id },
      data: {
        path: newPath,
        name: newName,
        url: newUrl,
      },
    });
  } catch (err) {
    // 清理新副本之前必须先确认没有别的活跃记录指向 newPath。
    // 并发改名 / 上传可能已经让另一条记录指向同一个 key，盲删就是删掉别人的文件。
    const otherRef = await prisma.storageFile
      .findFirst({
        where: {
          configId: config.id,
          path: newPath,
          isDeleted: false,
          id: { not: record.id },
        },
      })
      .catch(() => undefined);

    if (otherRef === undefined) {
      // 查都查不出来，宁可留个孤儿对象也不冒删错的风险
      console.error(
        "[S3] 重命名落库失败，且无法确认新副本归属，已保留对象待人工清理:",
        { newPath },
      );
    } else if (otherRef) {
      console.warn(
        "[S3] 重命名落库失败，新副本已被其它记录引用，跳过清理:",
        { newPath, otherRefId: otherRef.id },
      );
    } else {
      await client
        .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: newPath }))
        .catch((cleanupErr) => {
          console.error("[S3] 重命名落库失败，清理新副本也失败:", cleanupErr);
        });
    }
    throw err;
  }

  // DB 已指向新路径，旧对象删除失败只会留下孤儿对象，不影响读取，记录日志后仍返回成功。
  await client
    .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: safeOldPath }))
    .catch((cleanupErr) => {
      console.error("[S3] 重命名后删除旧对象失败，需手工清理:", {
        key: safeOldPath,
        ...describeS3Error(cleanupErr),
      });
    });

  return toFileItem(updated);
}

