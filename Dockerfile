FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies) so Vite can build
RUN npm ci

COPY . .

# Run the build while we still have devDependencies
RUN npm run build

# NOW set to production and remove dev dependencies to save space
ENV NODE_ENV=production
RUN npm prune --omit=dev

CMD ["npm", "run", "docker-start"]
