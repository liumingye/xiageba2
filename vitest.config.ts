import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * vitest 独立配置
 *
 * 作用：把 Nuxt/Nitro 在构建时生成的别名映射显式声明给 vitest，
 * 让那些直接 import "#server/lib/xxx" / "#shared/utils/xxx" 的服务端
 * 模块（如 simpleAC.ts、novel.ts）可在不启动 Nuxt dev server 的情况
 * 下被 vitest 解析。
 *
 * 别名依据：.nuxt/tsconfig.server.json 的 paths 字段。
 */
export default defineConfig({
  resolve: {
    alias: {
      // Nitro 端别名
      "#server": path.resolve(root, "server"),
      "#shared": path.resolve(root, "shared"),
      // Nuxt srcDir
      "~": path.resolve(root, "app"),
      "@": path.resolve(root, "app"),
      // workspace 网盘 SDK（dev 模式指向源码）
      "@netdisk-sdk/baidu-sdk": path.resolve(
        root,
        "packages/netdisk-sdk-js/packages/baidu-sdk/src",
      ),
      "@netdisk-sdk/quarkuc-sdk": path.resolve(
        root,
        "packages/netdisk-sdk-js/packages/quarkuc-sdk/src",
      ),
      "@netdisk-sdk/xunlei-sdk": path.resolve(
        root,
        "packages/netdisk-sdk-js/packages/xunlei-sdk/src",
      ),
      "@netdisk-sdk/utils": path.resolve(
        root,
        "packages/netdisk-sdk-js/packages/utils/src",
      ),
    },
  },
  test: {
    // 全部测试针对 Node 环境（服务端工具函数为主）
    environment: "node",
    // 默认 include 已覆盖 *.test.ts；显式声明便于查阅
    include: ["**/*.test.ts"],
    // 单测超时：scrypt 等加密测试较慢，给到 15s
    testTimeout: 15_000,
  },
});
