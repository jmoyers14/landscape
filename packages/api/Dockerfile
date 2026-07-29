FROM oven/bun:1 AS builder
WORKDIR /app

# Copy workspace manifests first for cached installs
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/worker/package.json packages/worker/
COPY packages/domain/package.json packages/domain/
COPY packages/platform/package.json packages/platform/

RUN bun install --frozen-lockfile

# Build the API (bundles @landscape/domain and @landscape/platform from source,
# so copy them too)
COPY tsconfig.json ./
COPY packages/domain/ packages/domain/
COPY packages/platform/ packages/platform/
COPY packages/api/ packages/api/
RUN bun run build:api

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./dist

# Build stamp (from deploy.sh) baked in as runtime env so the API can report
# exactly which build is running via the system.version query.
ARG APP_VERSION=0.0.0
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV APP_VERSION=$APP_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

# Cloud Run injects PORT; default to 8080 for local docker runs
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "run", "dist/index.js"]
