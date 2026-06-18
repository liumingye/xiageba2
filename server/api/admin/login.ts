import { usePrisma } from "~/lib/prisma";
import { createHash } from "crypto";
import { generateToken } from "~/server/utils/auth";

export default defineEventHandler(async (event) => {
  const prisma = usePrisma();
  const body = await readBody(event);
  const { username, password } = body;

  if (!username || !password) {
    throw createError({ statusCode: 400, message: "用户名和密码不能为空" });
  }

  const hashedPassword = createHash("sha256")
    .update(password)
    .digest("hex");

  const admin = await prisma.admin.findUnique({
    where: { username },
  });

  if (!admin || admin.password !== hashedPassword) {
    throw createError({ statusCode: 401, message: "用户名或密码错误" });
  }

  const token = generateToken(admin.username);

  setHeader(
    event,
    "Set-Cookie",
    `admin-token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 7}; Secure`,
  );

  return {
    id: admin.id,
    username: admin.username,
    token,
  };
});
