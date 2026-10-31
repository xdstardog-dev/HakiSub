ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
# 原生依赖必须在目标Linux/Node ABI上安装；保留预编译不可用时的构建能力。
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
FROM ${NODE_IMAGE}
ENV NODE_ENV=production
ENV XDSTAR_ACCOUNT_DATABASE=/app/data/accounts.sqlite
ENV XDSTAR_ACCOUNT_HOST=0.0.0.0
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
USER node
CMD ["node", "server/index.mjs"]
