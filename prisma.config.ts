import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import type { PrismaConfig } from "prisma";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const source = fs.readFileSync(envPath, "utf-8");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

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
