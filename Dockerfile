FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps ./apps

RUN npm run build -w @swarmboty/api && npm run build -w web

RUN mkdir -p /app/apps/api/public \
  && cp -R /app/apps/web/dist/web/browser/* /app/apps/api/public/

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/public ./apps/api/public

WORKDIR /app/apps/api
EXPOSE 8080

CMD ["node", "dist/index.js"]

