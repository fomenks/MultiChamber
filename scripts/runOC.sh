#!/bin/bash

# runOC.sh - Get port for user's OpenChamber instance
# Usage: ./runOC.sh <username>

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <username>"
    exit 1
fi

USERNAME="$1"

# Get user ID from system
UID=$(id -u "$USERNAME" 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "Error: User '$USERNAME' does not exist"
    exit 1
fi

PID_FILE="/tmp/${USERNAME}_OC.pid"
PORT=$((10000 + UID))

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    # Change to user's home directory and start OpenChamber
    USER_HOME=$(getent passwd "$USERNAME" | cut -d: -f6)
    
    # Start OpenChamber as the user
    sudo -u "$USERNAME" -s -H "cd ${USER_HOME} && openchamber -p $PORT" &
    
    # Wait a moment for process to start
    sleep 2
    
    # Create PID file
    echo $! > "$PID_FILE"
fi

echo "$PORT"
