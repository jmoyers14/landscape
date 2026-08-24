# The API runs from TypeScript SOURCE, not a bundle — like the worker, and for
# the same reason. @google-cloud/tasks is a gapic client that loads JSON config
# (*_client_config.json) via runtime require; `bun build` doesn't emit those
# assets, so a bundled image crashes at boot with "Cannot find module
# cloud_tasks_client_config.json". The API gained that dependency when it started
# enqueueing document renders and minting signed GCS URLs.
FROM oven/bun:1
WORKDIR /app

# Copy workspace manifests first for cached installs
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/worker/package.json packages/worker/
COPY packages/domain/package.json packages/domain/
COPY packages/platform/package.json packages/platform/

# --production: this image installs and then RUNS FROM SOURCE, so devDependencies
# are pure cost — biome and typescript are lint/typecheck tooling that never
# executes here, and Bun transpiles TS itself. Dropping them takes ~90s off the
# build and removes the biome platform binaries, whose slow, fat tarballs have
# lost the race under bun's 48-way concurrent install and failed the build.
# The web image must NOT do this: `vite build` needs those devDependencies.
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY packages/domain/ packages/domain/
COPY packages/platform/ packages/platform/
COPY packages/api/ packages/api/

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
CMD ["bun", "run", "packages/api/src/index.ts"]
