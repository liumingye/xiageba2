# syntax=docker/dockerfile:1.6

# 基于官方推荐的单一阶段，直接在容器中安装依赖并构建产物
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_PORT=3000

# 拷贝依赖清单并安装
COPY package*.json ./
RUN npm install --no-audit --no-fund --omit=dev || npm install --no-audit --no-fund

# 拷贝源码并构建
COPY . .
RUN npm run build

# 默认启动入口：先执行 Prisma 迁移，再启动 Nuxt
RUN printf '#!/bin/sh\nset -e\nnpx prisma migrate deploy || true\nnode /app/.output/server/index.mjs\n' > /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT [ "/app/docker-entrypoint.sh" ]
