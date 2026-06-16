import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

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
