import path from "node:path";
import type { PrismaConfig } from "prisma";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "[prisma.config.ts] 未检测到 DATABASE_URL：请在环境变量中设置，或在项目根目录创建 .env 文件并写入 DATABASE_URL",
  );
}

export default {
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url,
  },
} satisfies PrismaConfig;
