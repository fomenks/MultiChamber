#!/bin/bash

# OpenCode startup script for MultiChamber
# This script is called by the OpenChamberService for each user

set -e

# Get the port from environment variable
PORT=${OPENCODE_PORT:-3000}
HOST=${OPENCODE_HOST:-127.0.0.1}

echo "Starting OpenCode for user $USER on port $PORT..."

# Check if OpenCode is already running on this port
if command -v lsof &> /dev/null; then
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "OpenCode is already running on port $PORT"
        exit 0
    fi
fi

# Change to workspace directory
cd "$HOME/workspace" || cd "$HOME"

# Try different ways to start OpenCode

# 1. Try using bun to run OpenCode server directly
if [ -f "/app/opencode/server/index.js" ]; then
    echo "Starting OpenCode from /app/opencode/server..."
    cd /app/opencode/server
    exec bun start.js --port "$PORT" --host "$HOST" 2>&1
fi

# 2. Try using node
if [ -f "/app/opencode/server/index.js" ]; then
    echo "Starting OpenCode with node from /app/opencode/server..."
    cd /app/opencode/server
    exec node index.js --port "$PORT" --host "$HOST" 2>&1
fi

# 3. Try npm start from opencode directory
if [ -d "/app/opencode" ]; then
    cd /app/opencode
    if [ -f "package.json" ]; then
        echo "Starting OpenCode with npm from /app/opencode..."
        exec npm start -- --port "$PORT" --host "$HOST" 2>&1
    fi
fi

# 4. Try packages/web/server
if [ -f "/app/opencode/packages/web/server/index.js" ]; then
    echo "Starting OpenCode from packages/web/server..."
    cd /app/opencode/packages/web/server
    exec bun start.js --port "$PORT" --host "$HOST" 2>&1
fi

echo "Warning: OpenCode not found in /app/opencode"
exit 1
