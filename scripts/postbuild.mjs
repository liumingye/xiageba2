import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const outputServer = join(rootDir, ".output", "server");

if (!existsSync(outputServer)) {
  console.error(`[postbuild] ${outputServer} does not exist, skipping`);
  process.exit(0);
}

const dirs = ["prisma", "scripts"];
for (const dir of dirs) {
  const src = join(rootDir, dir);
  const dest = join(outputServer, dir);
  if (!existsSync(src)) continue;
  cpSync(src, dest, { recursive: true });
  console.log(`[postbuild] Copied ${dir}/ to .output/server/${dir}/`);
}
