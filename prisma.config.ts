import path from "node:path";
import type { PrismaConfig } from "prisma";

export default {
  // earlyAccess: true,
  schema: path.join(__dirname, "prisma", "schema.prisma"),

  datasource: {
    url: process.env.DATABASE_URL,
  },

  // migrate: {
  //   async url() {
  //     return process.env.DATABASE_URL!;
  //   },
  // },
} satisfies PrismaConfig;
