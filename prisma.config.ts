import path from "node:path";
import type { PrismaConfig } from "prisma";

export default {
  earlyAccess: true,
  schema: path.join(__dirname, "prisma", "schema.prisma"),

  migrate: {
    async url() {
      return process.env.DATABASE_URL!;
    },
  },
} satisfies PrismaConfig;
