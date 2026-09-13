# Build context is the repo root (npm workspaces monorepo).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspaces --if-present
# Drop devDependencies (@angular/cli, @angular/build, typescript, vitest, ...)
# from the hoisted node_modules tree before it gets copied into the runtime image.
RUN npm prune --omit=dev
# Angular CLI's incremental build cache -- irrelevant to the compiled dist
# output, but otherwise makes the copy below tens of MB bigger for nothing.
RUN rm -rf apps/utility-web/.angular

FROM node:24-bookworm-slim
WORKDIR /app
# Only the pruned hoisted node_modules, the shared workspace packages
# reached via node_modules/@utility/* symlinks, and this service's own
# tree (its local node_modules may hold prod deps npm couldn't hoist) --
# not utility-api's tree, which the shared build stage also produced but
# this service never touches.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/utility-web ./apps/utility-web
WORKDIR /app/apps/utility-web

ENV NODE_ENV=production
EXPOSE 4000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 4000) + '/__health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/utility-web/server/server.mjs"]
