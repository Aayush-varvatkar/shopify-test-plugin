# ---- Builder stage ----
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl

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

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

# Copy the compiled build output from the builder stage.
COPY --from=builder /app/build ./build

RUN npm run build

CMD ["npm", "run", "docker-start"]
