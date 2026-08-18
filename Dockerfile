FROM node:26-alpine AS build

# better-sqlite3 has no prebuilt musl binary for every release, so `npm ci`
# falls back to compiling it via node-gyp, which needs Python + a C++
# toolchain. Alpine's base image ships neither.
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps ./apps

RUN npm run build -w @swarmbot/api && npm run build -w web

RUN mkdir -p /app/apps/api/public/app \
  && cp -R /app/apps/web/dist/web/browser/* /app/apps/api/public/app/

FROM node:26-alpine AS runtime

RUN apk add --no-cache docker-cli

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# All workspace deps hoist to the root node_modules (copied above); nothing
# nests under apps/api/node_modules, and Node resolves up the tree to /app.
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/public ./apps/api/public

WORKDIR /app/apps/api
EXPOSE 8080

CMD ["node", "dist/index.js"]

