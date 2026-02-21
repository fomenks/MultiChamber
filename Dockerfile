FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20

# Install base dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    sudo \
    passwd \
    openssh-client \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Create app directory
WORKDIR /app

# Copy package files for MultiChamber server
COPY server/package*.json ./server/
COPY ui/package*.json ./ui/
COPY package*.json ./

# Install dependencies
RUN cd server && npm install
RUN cd ui && npm install
RUN npm install

# Copy application code
COPY . .

# Build UI
RUN cd ui && npm run build

# Build Server
RUN cd server && npm run build

# Create users base directory
RUN mkdir -p /home/users

# Copy initialization script
COPY scripts/init-system.sh /usr/local/bin/
RUN mkdir -p /app/opencode/server && chmod +x /usr/local/bin/init-system.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start command
CMD ["/usr/local/bin/init-system.sh"]
