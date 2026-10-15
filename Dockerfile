# 前端在 Windows 本地先构建；服务器只安装运行依赖，不执行 Vite 构建。
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
# 网关唯一第三方运行依赖是 ws；模型和 Vue 由浏览器加载 dist。
COPY --from=dependencies /app/node_modules/ws ./node_modules/ws
COPY server/ ./server/
COPY dist/ ./dist/
USER node
CMD ["node", "server/index.mjs", "--production"]
