#!/bin/bash

set -e

if [ -n "$MC_ADMIN_PASSWD" ]; then
    echo "Creating admin user..."
    mkdir -p /home
    useradd -m -d /home/admin -s /bin/bash admin 2>/dev/null || true
    echo "admin:$MC_ADMIN_PASSWD" | chpasswd
    usermod -aG sudo admin
    echo "Admin user created successfully"
else
    echo "Warning: MC_ADMIN_PASSWD not set, using default password 'admin'"
    mkdir -p /home
    useradd -m -d /home/admin -s /bin/bash admin 2>/dev/null || true
    echo "admin:admin" | chpasswd
    usermod -aG sudo admin
fi

mkdir -p /app/data

# echo "Starting OpenChamber instance..."
# openchamber serve -p 10000 -d &
# OPENCHAMBER_PID=$!

echo "Waiting for OpenChamber to start..."
sleep 5

echo "Starting MultiChamber server..."
cd /app/server
exec node dist/index.js