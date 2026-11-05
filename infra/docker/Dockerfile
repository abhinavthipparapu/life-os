# One image definition for the API and worker. Build with --build-arg APP=api or APP=worker.
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm prisma generate
ARG APP
RUN pnpm --filter @lifeos/${APP} build

FROM node:24-slim
ARG APP
ENV NODE_ENV=production APP=${APP}
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/${APP} ./apps/${APP}
COPY --from=build /repo/packages ./packages
USER node
WORKDIR /repo/apps/${APP}
CMD ["sh", "-c", "exec node dist/$( [ \"$APP\" = api ] && echo server || echo worker ).js"]
