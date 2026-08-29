# Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml .
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Run
FROM nginx:alpine
COPY --from=builder /app/out /usr/share/nginx/html
EXPOSE 80
