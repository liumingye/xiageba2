import "dotenv/config";
import { PrismaClient } from "@@/prisma/generated";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "prisma/config";
import postgres from "postgres";
import { speedExtension, type SpeedClient } from "@@/prisma/generated/sql";

const connectionString = env("DATABASE_URL");
if (!connectionString) {
  throw new Error("DATABASE_URL 环境变量未设置 — 请在 .env 或部署环境中配置");
}

const prismaClientSingleton = () => {
  const basePrisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 30,
    }),
  });

  const sql = postgres(connectionString, { max: 30 });

  // return basePrisma;
  return basePrisma.$extends(
    speedExtension({
      postgres: sql,
      // debug: true,
      // onQuery: (info) => {
      //   console.log(`${info.model}.${info.method} ${info.duration}ms`);
      //   console.log(info.sql);
      // },
    }),
  ) as unknown as SpeedClient<typeof basePrisma>;
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
