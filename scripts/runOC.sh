#!/bin/bash

# runOC.sh - Get port for user's OpenChamber instance
# Usage: ./runOC.sh <username>

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <username>" >&2
    exit 1
fi

USERNAME="$1"

if [ ! -d /tmp/mc ] ; then 
  echo "Making /tmp/mc dir"
  mkdir /tmp/mc  
  chmod a+rwx /tmp/mc 
fi

echo "Starting OpenChamber for user: $USERNAME" >&2

# Get user ID from system using Python
USER_ID=$(python3 -c "import pwd; print(pwd.getpwnam('$USERNAME').pw_uid)" 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "Error: User '$USERNAME' does not exist" >&2
    exit 1
fi

PID_FILE="/tmp/mc/${USERNAME}_OC.pid"
PORT=$((10000 + USER_ID))

echo "Calculated port: $PORT (UID: $USER_ID)" >&2

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
USER_HOME=$(python3 -c "import pwd; print(pwd.getpwnam('$USERNAME').pw_dir)" 2>/dev/null)
if [ -z "$USER_HOME" ]; then
    echo "Error: Could not determine home directory for user $USERNAME" >&2
    exit 1
fi

echo "Starting OpenChamber as user $USERNAME in directory $USER_HOME" >&2

# Start OpenChamber as the user
# Using full path to openchamber with daemon mode for proper backgrounding
# Note: OpenChamber binds to 127.0.0.1 by default
sudo -u "$USERNAME" /bin/bash -c "export PORT=${PORT} ; /usr/bin/tmux new-session -d -s OpenCode${USERNAME} '/usr/local/bin/userOC.sh'"
# Create PID file
echo "OpenChamber started successfully on port $PORT" >&2

echo "$PORT"