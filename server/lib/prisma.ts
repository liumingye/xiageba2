import "dotenv/config";
import { Pool } from "pg";
import { PrismaClient } from "@@/prisma/generated";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "prisma/config";
import postgres from "postgres";
import { speedExtension, type SpeedClient } from "@@/prisma/generated/sql";

const connectionString = env("DATABASE_URL");
if (!connectionString) {
  throw new Error("DATABASE_URL 环境变量未设置 — 请在 .env 或部署环境中配置");
}

/**
 * 单进程的连接预算，两类客户端各一个池：
 * - pg.Pool：Prisma 的事务与回退查询 + 各处原生 SQL 共用同一个池
 * - postgres.js：高速扩展（speedExtension）的加速查询，它只接受 postgres.js 客户端
 *
 * 原生 SQL 一律 `import { dbPool } from "#server/lib/prisma"`，不要再 new Pool()。
 */
const PG_POOL_MAX = 15;
const POSTGRES_POOL_MAX = 15;

const createDbPool = (url: string): Pool => {
  const pool = new Pool({ connectionString: url, max: PG_POOL_MAX });

  // 池中空闲连接出错（数据库重启、连接被重置等）时 pg 只会往池上抛 error 事件。
  // 没有监听器的话这是一个未处理的 error 事件，会让整个进程退出。
  pool.on("error", (err) => {
    console.error("[db] 连接池中的空闲连接出错，已丢弃该连接:", err.message);
  });

  return pool;
};

const createDbClients = () => {
  const pool = createDbPool(connectionString);

  const basePrisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  const sql = postgres(connectionString, { max: POSTGRES_POOL_MAX });

  const client = basePrisma.$extends(
    speedExtension({
      postgres: sql,
    }),
  ) as unknown as SpeedClient<typeof basePrisma>;

  return { prisma: client, dbPool: pool };
};

type DbClients = ReturnType<typeof createDbClients>;

const globalForDb = globalThis as unknown as {
  __dbClients: DbClients | undefined;
};

const clients = globalForDb.__dbClients ?? createDbClients();

if (process.env.NODE_ENV !== "production") globalForDb.__dbClients = clients;

export const prisma = clients.prisma;

/** 全进程唯一的 pg 连接池，供原生 SQL 使用（Prisma 适配器也在用它） */
export const dbPool = clients.dbPool;
