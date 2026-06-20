# syntax=docker/dockerfile:1.6

############################
# 1. Builder
############################
FROM node:lts-trixie-slim AS builder

WORKDIR /app

COPY . .

# 使用更稳定的 npm 镜像（可选）
RUN npm config set registry https://registry.npmmirror.com

RUN npm install --no-audit --no-fund

# Nuxt build
RUN npm run build

# 清理 dev 依赖（可选）
RUN npm prune --production


############################
# 2. Runtime
############################
FROM node:lts-trixie-slim

WORKDIR /app

COPY --from=builder /app/.output ./

# prisma client
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 运行阶段：切换到生产模式

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.mjs"]
