# =============================================================================
# Chat API - Multi-stage Docker Build
# =============================================================================
# Stage 1: Build TypeScript
# Stage 2: Production runtime (minimal image)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:20-alpine

# Add labels for Railway
LABEL maintainer="mnehmos"
LABEL org.opencontainers.image.source="https://github.com/mnehmos/The-Worlds-Largest-Dungeon"
LABEL org.opencontainers.image.description="Chat API middleware for World's Largest Dungeon"

WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check (uses /status which always returns 200, not /health which checks backends)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/status || exit 1

# Run the server
CMD ["node", "dist/index.js"]
