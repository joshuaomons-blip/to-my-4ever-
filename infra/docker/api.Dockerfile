# syntax=docker/dockerfile:1.7
# API + worker image (same image, different command). Build from repo root:
#   docker build -f infra/docker/api.Dockerfile -t aureon-api .
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @aureon/api...
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN pnpm --filter @aureon/api build \
 && pnpm --filter @aureon/api deploy --legacy --prod /out \
 && cp -r apps/api/dist /out/dist && cp -r apps/api/migrations /out/migrations

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/migrations ./migrations
COPY --from=build /out/package.json ./package.json
USER nonroot
EXPOSE 4000
# Default: API. Worker: ["dist/worker.js"]. Migrations: ["dist/database/migrate.js"].
CMD ["dist/main.js"]
