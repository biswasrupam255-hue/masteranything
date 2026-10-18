# syntax=docker/dockerfile:1

# =============================================================== build stage
# Full toolchain lives here: dev dependencies, TypeScript, the compiler.
# None of it survives into the final image.
FROM node:24-alpine AS build
WORKDIR /app

# Copy manifests FIRST, install, THEN copy source. Docker caches per layer, so
# editing src/ does not re-run npm ci - only changing the lockfile does.
# Copying everything up front would throw that cache away on every commit.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ============================================================ production deps
# A separate stage so the runtime gets node_modules WITHOUT dev dependencies.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ============================================================= runtime stage
FROM node:24-alpine AS runtime

# Stamped at build time so a running container can tell you exactly which
# commit it is. GET /health reports it.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
ENV NODE_ENV=production

WORKDIR /app

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./

# node:alpine ships a non-root "node" user. Containers run as root by default,
# which means a container escape starts as root. One line to avoid that.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Exec form (JSON array), not shell form. Shell form wraps the process in
# /bin/sh, which swallows SIGTERM, so your container takes 10s to stop and
# drops in-flight requests on every deploy.
CMD ["node", "dist/server.js"]
