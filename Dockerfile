FROM node:25-slim@sha256:32f45869cf02c26971de72c383d5f99cab002905ed8b515b56df925007941782 AS build

WORKDIR /usr/src/app

# Copy only package files first for better layer caching
COPY package*.json ./

# Install all dependencies including dev for build tools
RUN npm ci --no-audit --no-fund

# Copy only TypeScript config first (changes less frequently)
COPY tsconfig*.json ./

# Copy source files
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY README.md ./

# Build with TypeScript incremental compilation (excluding tests) and minify
RUN npm run build:prod && \
    rm -rf src/tests src/**/*.test.* && \
    find dist -name "*.map" -delete && \
    find src/routes -name "*.ts" -delete && \
    find src/routes -name "*.js" -delete && \
    rm -f public/tsconfig.json && \
    rm -rf dist/scripts && \
    rm -f dist/src/type.js && \
    rm -rf vitest.config.* && \
    rm -rf eslint.config.* && \
    rm -rf playwright.config.*

FROM node:25-slim@sha256:32f45869cf02c26971de72c383d5f99cab002905ed8b515b56df925007941782

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl tree && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy only production dependencies and built files
COPY --chown=node:node package*.json ./
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy built application
COPY --chown=node:node --from=build /usr/src/app/dist ./dist
COPY --chown=node:node --from=build /usr/src/app/public ./public
COPY --chown=node:node --from=build /usr/src/app/src/routes ./src/routes
COPY --chown=node:node --from=build /usr/src/app/README.md ./

# Display directory structure excluding node_modules
RUN echo "Build time: $(date)" && \
    ls -d */ | grep -v node_modules | xargs -I {} tree {}

USER node

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=30s --start-period=120s --retries=3 CMD curl -f http://localhost:80/healthz || exit 1

ENV APP_ENV production

CMD ["node", "--no-warnings", "--max-old-space-size=512", "dist/src/server.js"]
