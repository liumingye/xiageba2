import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createHash } from "crypto";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "..", ".env");
if (existsSync(envPath)) {
  config({ path: envPath });
}

const connectionString = process.env.DATABASE_URL || "";
if (!connectionString) {
  console.error("请在 .env 中设置 DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = process.argv[2] || "admin";
  const password = process.argv[3] || "admin";

  const existing = await prisma.admin.findUnique({
    where: { username },
  });

  if (existing) {
    console.log(`管理员 ${username} 已存在，跳过创建`);
    process.exit(0);
  }

  const hashedPassword = createHash("sha256").update(password).digest("hex");

  await prisma.admin.create({
    data: { username, password: hashedPassword },
  });

  console.log(`管理员 ${username} 创建成功，密码：${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
