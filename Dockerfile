# The API and the built site in one image. CI pushes it to ghcr and deploys it to the VPS (.github/workflows/deploy.yml).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --loglevel=error
COPY . .
ARG VITE_TURNSTILE_SITE_KEY=
ARG VITE_DEMO_NOW=
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 STATIC_DIR=/app/dist NPM_CONFIG_UPDATE_NOTIFIER=false
ARG DEMO_NOW=
ENV DEMO_NOW=$DEMO_NOW
# tsx and drizzle-kit run the server and the migrations, so the full install comes along.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json drizzle.config.ts tsconfig*.json ./
COPY server ./server
COPY src ./src
USER node
EXPOSE 8787
CMD ["sh", "-c", "./node_modules/.bin/drizzle-kit migrate && exec node --import tsx server/node.ts"]
