// 回归：并发改到同一个目标文件名时，只能有一条记录成功，
// 且失败方绝不能删掉胜者正在使用的对象。
//
// 旧实现的窗口：两个请求都能通过「目标是否占用」检查 → 都复制 → 后一个落库失败时
// 盲删 newPath，把前一个已成功记录指向的对象删掉（不可逆）。

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as any[],
  objects: new Set<string>(),
  /** 探测行为：normal 走 objects 判定；forbidden 模拟 RustFS 403；empty 模拟 416 */
  probeMode: "normal" as "normal" | "forbidden" | "empty",
  copyCalls: [] as string[],
  deleteCalls: [] as string[],
  updateFails: false,
  /** update 失败前，先插入一条并发的、指向 newPath 的记录 */
  rivalOnUpdate: false,
}));

const CONFIG = {
  id: 1,
  name: "test",
  baseUrl: "",
  bucket: "bucket",
  prefix: "",
  endpoint: "http://s3.local",
  region: "auto",
  accessKey: "k",
  secretKey: "s",
  isHidden: false,
};

vi.mock("#server/lib/prisma", () => {
  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([field, expected]: [string, any]) => {
      if (expected && typeof expected === "object" && "not" in expected) {
        return row[field] !== expected.not;
      }
      return row[field] === expected;
    });

  return {
    prisma: {
      s3Config: {
        findUnique: async () => CONFIG,
      },
      storageFile: {
        findFirst: async ({ where }: any) =>
          h.rows.find((row) => matches(row, where)) ?? null,
        create: async ({ data }: any) => {
          const row = { id: `id-${h.rows.length}`, createdAt: new Date(), ...data };
          h.rows.push(row);
          return { ...row };
        },
        update: async ({ where, data }: any) => {
          await Promise.resolve(); // 让出执行权，放大并发窗口
          if (h.updateFails) {
            if (h.rivalOnUpdate) {
              h.rows.push({
                id: "rival",
                configId: 1,
                path: data.path,
                name: "rival",
                size: 1,
                mimeType: "",
                url: "",
                isDeleted: false,
                createdAt: new Date(),
              });
            }
            throw new Error("db update failed");
          }
          const row = h.rows.find((r) => r.id === where.id);
          Object.assign(row, data);
          return { ...row };
        },
      },
    },
  };
});

vi.mock("@aws-sdk/client-s3", () => {
  class Cmd {
    kind = "cmd";
    constructor(public input: any) {}
  }
  class GetObjectCommand extends Cmd {
    override kind = "get";
  }
  class CopyObjectCommand extends Cmd {
    override kind = "copy";
  }
  class DeleteObjectCommand extends Cmd {
    override kind = "delete";
  }
  class PutObjectCommand extends Cmd {
    override kind = "put";
  }

  class S3Client {
    async send(cmd: Cmd) {
      if (cmd.kind === "get") {
        if (h.probeMode === "forbidden") {
          const err: any = new Error("UnknownError");
          err.name = "Unknown";
          err.$metadata = { httpStatusCode: 403 };
          throw err;
        }
        if (h.probeMode === "empty") {
          const err: any = new Error("InvalidRange");
          err.name = "InvalidRange";
          err.$metadata = { httpStatusCode: 416 };
          throw err;
        }
        if (!h.objects.has(cmd.input.Key)) {
          const err: any = new Error("NoSuchKey");
          err.name = "NoSuchKey";
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Body: { destroy() {} } };
      }
      if (cmd.kind === "copy") {
        h.copyCalls.push(cmd.input.Key);
        h.objects.add(cmd.input.Key);
        return {};
      }
      if (cmd.kind === "delete") {
        h.deleteCalls.push(cmd.input.Key);
        h.objects.delete(cmd.input.Key);
        return {};
      }
      return {};
    }
  }

  return {
    S3Client,
    GetObjectCommand,
    CopyObjectCommand,
    DeleteObjectCommand,
    PutObjectCommand,
  };
});

vi.stubGlobal("createError", (options: any) =>
  Object.assign(new Error(options.message), options),
);

const { renameFile } = await import("./s3");

const makeRow = (id: string, path: string) => ({
  id,
  configId: 1,
  path,
  name: path,
  size: 10,
  mimeType: "audio/mpeg",
  url: `http://s3.local/bucket/${path}`,
  isDeleted: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
});

const settle = async (promise: Promise<unknown>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: any) => ({ ok: false as const, error }),
  );

describe("renameFile 并发改名", () => {
  beforeEach(() => {
    h.rows = [makeRow("a", "a.txt"), makeRow("b", "b.txt")];
    h.objects = new Set(["a.txt", "b.txt"]);
    h.probeMode = "normal";
    h.copyCalls = [];
    h.deleteCalls = [];
    h.updateFails = false;
    h.rivalOnUpdate = false;
  });

  it("两个请求改到同一目标名：只有一个成功，另一个 409，且不删目标对象", async () => {
    const results = await Promise.all([
      settle(renameFile(1, "a.txt", "same.mp3")),
      settle(renameFile(1, "b.txt", "same.mp3")),
    ]);

    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as any).error.statusCode).toBe(409);

    // 关键断言：胜者的新对象还在
    expect(h.objects.has("same.mp3")).toBe(true);
    expect(h.deleteCalls).not.toContain("same.mp3");

    // DB 里只有一条记录指向 same.mp3
    expect(h.rows.filter((r) => r.path === "same.mp3")).toHaveLength(1);
  });

  it("目标被不可判定的探测命中时 fail-closed，返回 503 且不复制", async () => {
    h.probeMode = "forbidden";

    const result = await settle(renameFile(1, "a.txt", "other.mp3"));

    expect(result.ok).toBe(false);
    expect((result as any).error.statusCode).toBe(503);
    expect(h.copyCalls).toHaveLength(0);
    expect(h.objects.has("a.txt")).toBe(true);
  });

  it("目标为空对象（416）视为已占用，返回 409", async () => {
    h.probeMode = "empty";

    const result = await settle(renameFile(1, "a.txt", "zero.mp3"));

    expect(result.ok).toBe(false);
    expect((result as any).error.statusCode).toBe(409);
  });

  it("落库失败且新副本无人引用时才清理", async () => {
    h.updateFails = true;

    const result = await settle(renameFile(1, "a.txt", "fresh.mp3"));

    expect(result.ok).toBe(false);
    expect(h.deleteCalls).toContain("fresh.mp3");
  });

  it("落库失败但新副本已被并发记录引用时，绝不清理", async () => {
    h.updateFails = true;
    h.rivalOnUpdate = true;

    const result = await settle(renameFile(1, "a.txt", "shared.mp3"));

    expect(result.ok).toBe(false);
    expect(h.deleteCalls).not.toContain("shared.mp3");
    expect(h.objects.has("shared.mp3")).toBe(true);
  });
});
