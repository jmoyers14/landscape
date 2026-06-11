FROM oven/bun:1 AS builder
WORKDIR /app

# Copy workspace manifests first for cached installs
COPY package.json bun.lock tsconfig.json ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/

RUN bun install --frozen-lockfile

# The API base URL is baked into the static bundle at build time
COPY packages/web/ packages/web/
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN bun run build:web

FROM nginx:alpine
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
