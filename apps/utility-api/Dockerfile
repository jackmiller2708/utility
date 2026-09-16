# Build context is the repo root (npm workspaces monorepo).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspaces --if-present
# Drop devDependencies (typescript, vitest, oxlint, @nestjs/cli, ...) from the
# hoisted node_modules tree before it gets copied into the runtime image.
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils ffmpeg python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --break-system-packages --no-cache-dir yt-dlp \
    && yt-dlp -U

WORKDIR /app
# Only the pruned hoisted node_modules, the shared workspace packages
# reached via node_modules/@utility/* symlinks, and this service's own
# tree (its local node_modules may hold prod deps npm couldn't hoist) --
# not utility-web's tree, which the shared build stage also produced but
# this service never touches.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/utility-api ./apps/utility-api
WORKDIR /app/apps/utility-api

ENV NODE_ENV=production
EXPOSE 3000
# Prometheus scrape target -- deliberately not routed through Caddy (see main.ts); reachable
# only from other containers on the Docker "internal" network.
EXPOSE 9464
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/v1/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
