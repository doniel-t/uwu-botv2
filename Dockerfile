FROM node:20-slim

# Pinned: pnpm@latest broke builds when pnpm 11+ changed how build scripts are approved.
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

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
