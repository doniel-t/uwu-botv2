# Node 20: zlib-sync 0.1.9 (via nan 2.18) does not compile against Node 22.
FROM node:20-slim

# pnpm is pinned: pnpm@latest (11+) changed how build scripts are approved and needs Node >= 22.13.
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, canvas, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    pkg-config \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV VECTOR_DB_PATH=/app/data/vector.db

CMD ["pnpm", "run", "main"]
