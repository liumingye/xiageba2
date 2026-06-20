# syntax=docker/dockerfile:1.6

# 使用 @node-rs/jieba（预编译二进制，零编译依赖）
# 不再需要 build-essential / python3
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_PORT=3000

# 拷贝依赖清单并安装（容器内全新安装，避免主机 node_modules 污染）
COPY package*.json ./
RUN npm install --no-audit --no-fund

# 拷贝源码并构建
COPY . .
RUN npm run build

# 默认启动入口：先执行 Prisma 迁移，再启动 Nuxt
RUN printf '#!/bin/sh\nset -e\nnpx prisma migrate deploy || true\nnode /app/.output/server/index.mjs\n' > /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT [ "/app/docker-entrypoint.sh" ]
