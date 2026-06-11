FROM oven/bun:1 AS builder
WORKDIR /app

# Copy workspace manifests first for cached installs
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/

RUN bun install --frozen-lockfile

# Build the API
COPY tsconfig.json ./
COPY packages/api/ packages/api/
RUN bun run build:api

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./dist

# Cloud Run injects PORT; default to 8080 for local docker runs
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "run", "dist/index.js"]
