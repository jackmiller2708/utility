# Build context is the repo root (npm workspaces monorepo).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspaces --if-present

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/utility-web

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 4000) + '/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/utility-web/server/server.mjs"]
