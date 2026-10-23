# syntax=docker/dockerfile:1

# ═══════════════════════════════════════════════════════════════
# Stage 1: Build
#   - 安装全部依赖
#   - 生成 Prisma Client
#   - 构建 Nuxt 应用
#   - prune devDependencies，只保留生产依赖
# ═══════════════════════════════════════════════════════════════
FROM node:22-slim AS build

# 国内源：apt → 清华源
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|security.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources

# npm 源（corepack prepare 下载 pnpm 走 npm registry）
RUN npm config set registry https://registry.npmmirror.com

RUN corepack enable && corepack prepare pnpm@10.21.0 --activate

# pnpm 源
RUN pnpm config set registry https://registry.npmmirror.com

WORKDIR /app

# --- 依赖清单（层缓存优化）---
# 先复制所有 package.json，再执行 install，这样源码变动不会导致依赖层失效
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/netdisk-sdk-js/package.json ./packages/netdisk-sdk-js/
COPY packages/netdisk-sdk-js/packages/baidu-sdk/package.json    ./packages/netdisk-sdk-js/packages/baidu-sdk/
COPY packages/netdisk-sdk-js/packages/c139-sdk/package.json     ./packages/netdisk-sdk-js/packages/c139-sdk/
COPY packages/netdisk-sdk-js/packages/guangya-sdk/package.json  ./packages/netdisk-sdk-js/packages/guangya-sdk/
COPY packages/netdisk-sdk-js/packages/quarkUC-sdk/package.json  ./packages/netdisk-sdk-js/packages/quarkUC-sdk/
COPY packages/netdisk-sdk-js/packages/xunlei-sdk/package.json   ./packages/netdisk-sdk-js/packages/xunlei-sdk/
COPY packages/netdisk-sdk-js/packages/utils/package.json        ./packages/netdisk-sdk-js/packages/utils/
COPY packages/netdisk-sdk-js/types/error/package.json           ./packages/netdisk-sdk-js/types/error/

# 安装全部依赖（含 devDependencies，构建必需）
# ⚠️ 不能设置 NODE_ENV=production，否则跳过 @nuxtjs/tailwindcss 等
RUN pnpm install --frozen-lockfile

# --- 源码 & 构建 ---
COPY . .

# 生成 Prisma Client（含 prisma-sql）
# binaryTargets 已包含 debian-openssl-3.0.x，与生产镜像一致
RUN DATABASE_URL="postgresql://placeholder:5432/db" PRISMA_SQL_SKIP_PLANNER=true npx prisma generate

# 预热 prisma 引擎二进制（schema-engine），确保运行时无需联网下载
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma validate >/dev/null 2>&1 || true

RUN pnpm build

RUN node postbuild.mjs

# --- 清理：prune devDependencies，只留生产依赖 ---
# build 产物 .output/ 已生成，不再需要 devDeps
RUN CI=true pnpm prune --prod --ignore-scripts && \
    pnpm store prune && \
    rm -rf /root/.npm /root/.cache /tmp/*

# 清理 workspace 包中的冗余文件：.ts 源码、.map 调试文件
# （SDK 代码已被 Nitro 打包进 .output，运行时不依赖源码）
RUN find ./packages -name "*.ts" -not -name "*.d.ts" -type f -delete 2>/dev/null; \
    find ./packages -name "*.map" -type f -delete 2>/dev/null; \
    find ./packages -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null; \
    find ./packages -name "*.test.ts" -type f -delete 2>/dev/null; \
    exit 0

# 移除仅构建时需要、运行时不需要的大型包（prisma CLI 运行不受影响）
RUN rm -rf ./node_modules/.pnpm/typescript@* \
           ./node_modules/.pnpm/@esbuild+* \
           ./node_modules/.pnpm/esbuild@* \
           ./node_modules/.pnpm/@swc+* \
           ./node_modules/.pnpm/@parcel+* \
           ./node_modules/.pnpm/@rolldown+* \
           ./node_modules/.pnpm/lightningcss@* \
           ./node_modules/.pnpm/@shikijs+* 2>/dev/null || true


# ═══════════════════════════════════════════════════════════════
# Stage 2: Production（极简运行时）
#   - 从 build stage 直接复用 node_modules + .output
#   - 无需 npm/pnpm/corepack，减少工具链体积
# ═══════════════════════════════════════════════════════════════
FROM node:22-slim AS production

# 国内源：apt → 清华源
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|security.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources

# 运行时系统依赖（Prisma 引擎需要 openssl）
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- 从 build stage 复制运行时文件 ---
# .output 包含 Nuxt 服务端产物及 .output/server/node_modules（仅运行时依赖，约 38MB）
COPY --from=build /app/.output       ./.output

# 根 node_modules：供 prisma CLI（migrate deploy）使用
# 服务端运行时优先使用 .output/server/node_modules，不依赖此目录
COPY --from=build /app/node_modules  ./node_modules

# Prisma 相关（运行时 migrate deploy 需要）
COPY --from=build /app/prisma         ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/package.json   ./

# --- 运行环境 ---
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "try { require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode < 400 ? 0 : 1)}) } catch(e) { process.exit(1) }"

# 启动：先执行数据库迁移，再启动 Nuxt 服务
# 使用 node 直接调用 prisma CLI 入口，避免 npx 联网下载
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node .output/server/index.mjs"]
