FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20
ENV OPENCODE_PORT=4096

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

RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openchamber/web
RUN npm install -g opencode-ai

WORKDIR /app

COPY server/package*.json ./server/
COPY ui/package*.json ./ui/
COPY package*.json ./

RUN cd server && npm install
RUN cd ui && npm install
RUN npm install --save-dev tsx typescript @types/node

COPY . .

RUN cd ui && npm run build
RUN cd server && npm run build

RUN mkdir -p /home/users
RUN mkdir -p /app/data

COPY scripts/init-system.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-system.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["/usr/local/bin/init-system.sh"]