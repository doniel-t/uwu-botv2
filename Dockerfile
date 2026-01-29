FROM node:20-slim

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
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV VECTOR_DB_PATH=/app/data/vector.db

# dotenv.config({ path: './secrets/.env' }) is used in source,
# but in Docker we pass env vars via env_file in docker-compose.
# dotenv silently fails if the file doesn't exist, and the vars
# are already in the environment from docker-compose env_file.

CMD ["npx", "ts-node", "."]
