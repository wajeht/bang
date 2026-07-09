FROM node:26.5.0-slim@sha256:ffc78385a788964bb3cbab5e434ff79a10bdc25b8ae6db03fe5fe6cb14053c09 AS build

WORKDIR /usr/src/app

# Copy only package files first for better layer caching
COPY package*.json .npmrc ./

# Install all dependencies including dev for build tools, then rebuild native modules
RUN npm ci --no-audit --no-fund && \
    npm rebuild better-sqlite3 bcrypt esbuild --ignore-scripts=false

# Copy only TypeScript config first (changes less frequently)
COPY tsconfig*.json ./

# Copy source files
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY README.md ./

# Build with TypeScript incremental compilation (excluding tests) and minify
RUN node --run build:prod && \
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

FROM node:26.5.0-slim@sha256:ffc78385a788964bb3cbab5e434ff79a10bdc25b8ae6db03fe5fe6cb14053c09

# Install runtime dependencies.
# sqlite3 lets dcdb dump/inspect the production SQLite database.
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl sqlite3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy only production dependencies and built files
COPY --chown=node:node package*.json .npmrc ./
RUN npm ci --only=production --no-audit --no-fund && \
    npm rebuild better-sqlite3 bcrypt esbuild --ignore-scripts=false && \
    npm cache clean --force

# Copy built application
COPY --chown=node:node --from=build /usr/src/app/dist ./dist
COPY --chown=node:node --from=build /usr/src/app/public ./public
COPY --chown=node:node --from=build /usr/src/app/src/routes ./src/routes
COPY --chown=node:node --from=build /usr/src/app/README.md ./

USER node

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=30s --start-period=120s --retries=3 CMD curl -f http://localhost:80/healthz || exit 1

ENV APP_ENV production

CMD ["node", "--env-file-if-exists=.env", "--no-warnings", "--max-old-space-size=512", "dist/src/server.js"]
