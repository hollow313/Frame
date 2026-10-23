# Multi-stage Dockerfile for Frame - Ultra-lightweight Alpine Linux container
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=30018
ENV PUID=568
ENV PGID=568

# Install su-exec and shadow utilities to support runtime UID/GID switching
RUN apk add --no-cache su-exec shadow

# Create default frame user (UID 568, GID 568)
RUN groupadd -g 568 frame && \
    useradd -u 568 -g frame -m -s /bin/sh frame

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built frontend & server bundles
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Prepare data & config directories
RUN mkdir -p /app/data /app/config && \
    chown -R frame:frame /app && \
    chmod +x ./docker-entrypoint.sh

VOLUME ["/app/data", "/app/config"]

EXPOSE 30018

# Healthcheck Docker natif (B-10)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:30018/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server/index.js"]
