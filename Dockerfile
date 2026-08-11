# syntax=docker/dockerfile:1

# ═══════════════════════════════════════════════════════════════
# Stage 1: Build
#   - 安装全部依赖
#   - 生成 Prisma Client
#   - 构建 Nuxt 应用
#   - prune devDependencies，只保留生产依赖
# ═══════════════════════════════════════════════════════════════
FROM node:20-slim AS build

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
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/netdisk-sdk-js/package.json ./packages/netdisk-sdk-js/
COPY packages/netdisk-sdk-js/packages/baidu-sdk/package.json \
     ./packages/netdisk-sdk-js/packages/baidu-sdk/
COPY packages/netdisk-sdk-js/packages/quarkUC-sdk/package.json \
     ./packages/netdisk-sdk-js/packages/quarkUC-sdk/
COPY packages/netdisk-sdk-js/packages/xunlei-sdk/package.json \
     ./packages/netdisk-sdk-js/packages/xunlei-sdk/
COPY packages/netdisk-sdk-js/packages/utils/package.json \
     ./packages/netdisk-sdk-js/packages/utils/

# workspace 包源码（pnpm workspace:* 协议需要）
COPY packages/ ./packages/

# 安装全部依赖（含 devDependencies，构建必需）
# ⚠️ 不能设置 NODE_ENV=production，否则跳过 @nuxtjs/tailwindcss 等
RUN pnpm install --frozen-lockfile

# --- 源码 & 构建 ---
COPY . .

RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate

RUN pnpm build

RUN node postbuild.mjs

# --- 清理：prune devDependencies，只留生产依赖 ---
# build 产物 .output/ 已生成，不再需要 devDeps
RUN CI=true pnpm prune --prod --ignore-scripts && \
    pnpm store prune && \
    rm -rf /root/.npm /root/.cache /tmp/*

# 清理 workspace 包中的冗余文件：.ts 源码、.map 调试文件
RUN find ./packages -name "*.ts" -not -name "*.d.ts" -type f -delete && \
    find ./packages -name "*.map" -type f -delete && \
    find ./packages -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null; exit 0


# ═══════════════════════════════════════════════════════════════
# Stage 2: Production（极简运行时）
#   - 从 build stage 直接复用 node_modules + .output
#   - 无需 npm/pnpm/corepack，减少 ~200MB+ 工具链
# ═══════════════════════════════════════════════════════════════
FROM node:20-slim AS production

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

# --- 从 build stage 复制全部运行时文件 ---
COPY --from=build /app/node_modules  ./node_modules
COPY --from=build /app/packages      ./packages
COPY --from=build /app/.output       ./.output
COPY --from=build /app/package.json  ./

# --- Prisma 相关（运行时 migrate 需要）---
COPY --from=build /app/prisma         ./prisma
COPY --from=build /app/prisma.config.ts ./

# 重生成 Prisma Client（确保 debian-openssl-3.0.x 二进制兼容）
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate

# --- 运行环境 ---
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "try { require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode < 400 ? 0 : 1)}) } catch(e) { process.exit(1) }"

CMD ["sh", "-c", "npx prisma migrate deploy && node .output/server/index.mjs"]
