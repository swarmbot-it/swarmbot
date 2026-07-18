FROM node:26-alpine AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps ./apps

RUN npm run build -w @swarmbot/api && npm run build -w web

RUN mkdir -p /app/apps/api/public \
  && cp -R /app/apps/web/dist/web/browser/* /app/apps/api/public/

FROM node:26-alpine AS runtime

RUN apk add --no-cache docker-cli

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# npm nests workspace-conflicting packages (e.g. @as-integrations/express5)
# under apps/api/node_modules instead of hoisting them to the root.
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/public ./apps/api/public

WORKDIR /app/apps/api
EXPOSE 8080

CMD ["node", "dist/index.js"]

