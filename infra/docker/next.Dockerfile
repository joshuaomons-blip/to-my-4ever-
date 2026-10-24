# syntax=docker/dockerfile:1.7
# Shared image recipe for the customer web app and the admin console.
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=web   -t aureon-web .
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=admin -t aureon-admin .
FROM node:22-bookworm-slim AS build
ARG APP
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/${APP}/package.json apps/${APP}/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter @aureon/${APP}...
COPY packages/ui packages/ui
COPY apps/${APP} apps/${APP}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @aureon/${APP} build

FROM gcr.io/distroless/nodejs22-debian12:nonroot
ARG APP
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/${APP}/.next/standalone ./
COPY --from=build /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
USER nonroot
EXPOSE 3000
# Override per app in compose/orchestrator: apps/web/server.js or apps/admin/server.js
CMD ["apps/web/server.js"]
