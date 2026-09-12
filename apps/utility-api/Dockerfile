# Build context is the repo root (npm workspaces monorepo).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspaces --if-present

FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/utility-api

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/v1/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
