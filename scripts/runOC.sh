#!/bin/bash

# runOC.sh - Get port for user's OpenChamber instance
# Usage: ./runOC.sh <username>

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <username>" >&2
    exit 1
fi

USERNAME="$1"

echo "Starting OpenChamber for user: $USERNAME" >&2

# Get user ID from system
UID=$(id -u "$USERNAME" 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "Error: User '$USERNAME' does not exist" >&2
    exit 1
fi

PID_FILE="/tmp/${USERNAME}_OC.pid"
PORT=$((10000 + UID))

echo "Calculated port: $PORT (UID: $UID)" >&2

# Check if PID file exists and process is still running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "OpenChamber already running with PID $PID on port $PORT for user $USERNAME" >&2
        echo "$PORT"
        exit 0
    else
        echo "Stale PID file found, removing it" >&2
        rm -f "$PID_FILE"
    fi
fi

# Change to user's home directory and start OpenChamber
USER_HOME=$(getent passwd "$USERNAME" | cut -d: -f6)
if [ -z "$USER_HOME" ]; then
    echo "Error: Could not determine home directory for user $USERNAME" >&2
    exit 1
fi

echo "Starting OpenChamber as user $USERNAME in directory $USER_HOME" >&2

# Start OpenChamber as the user
sudo -u "$USERNAME" -s -H "cd ${USER_HOME} && openchamber -p $PORT" &
OPENCHAMBER_PID=$!

# Wait a moment for process to start
sleep 2

# Verify process started
if ! kill -0 "$OPENCHAMBER_PID" 2>/dev/null; then
    echo "Error: OpenChamber process failed to start (PID: $OPENCHAMBER_PID)" >&2
    exit 1
fi

# Create PID file
echo $OPENCHAMBER_PID > "$PID_FILE"
echo "Created PID file $PID_FILE with PID $OPENCHAMBER_PID" >&2

# Verify PID file was created
if [ ! -f "$PID_FILE" ]; then
    echo "Error: Failed to create PID file $PID_FILE" >&2
    exit 1
fi

echo "OpenChamber started successfully with PID $OPENCHAMBER_PID on port $PORT" >&2
echo "$PORT"
