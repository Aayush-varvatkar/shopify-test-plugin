# ---- Builder stage ----
# Use Debian (glibc) so that Rollup's platform-specific native binary
# (@rollup/rollup-linux-x64-gnu) is installed correctly by npm ci.
# Alpine (musl) triggers a known npm bug with optional dependencies:
# https://github.com/npm/cli/issues/4828
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies) so that
# Vite and TypeScript are available for `react-router build`.
RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install only production dependencies for the final image.
RUN npm ci --omit=dev && npm cache clean --force

# Copy the compiled build output from the builder stage.
COPY --from=builder /app/build ./build

# Copy runtime assets needed by the docker-start script.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/shopify.app.toml ./shopify.app.toml

CMD ["npm", "run", "docker-start"]
