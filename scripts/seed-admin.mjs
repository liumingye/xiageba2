import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
// 注意：此处直接 inline 一个与 server/utils/password.ts 一致的简化版 scrypt 哈希，
// 避免在独立脚本中依赖 #server 命名空间 alias。
import { randomBytes, scryptSync } from "crypto";

function hashPassword(plain) {
  if (!plain) throw new Error("密码不能为空");
  const N = 2 ** 14;
  const salt = randomBytes(4).toString("hex");
  const derived = scryptSync(plain, salt, 16, { N, r: 8, p: 1 }).toString(
    "hex",
  );
  return `${salt}$${derived}`;
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

  const hashedPassword = hashPassword(password);

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
