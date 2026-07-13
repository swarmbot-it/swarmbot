FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps ./apps
COPY scripts/sync-app-version.mjs scripts/sync-app-version.mjs

RUN node scripts/sync-app-version.mjs \
  && export SW4RM_BOT_VERSION="$(node -p "require('./package.json').version")" \
  && npm run build -w @sw4rmbot/api && npm run build -w web

RUN mkdir -p /app/apps/api/public \
  && cp -R /app/apps/web/dist/web/browser/* /app/apps/api/public/

FROM node:24-alpine AS runtime

# Required for GraphQL createStack / stack rm (docker stack deploy via CLI).
RUN apk add --no-cache docker-cli

ENV NODE_ENV=production
ARG APP_VERSION=0.1.4
ENV SW4RM_BOT_VERSION=${APP_VERSION}
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/public ./apps/api/public

WORKDIR /app/apps/api
EXPOSE 8080

CMD ["node", "dist/index.js"]

