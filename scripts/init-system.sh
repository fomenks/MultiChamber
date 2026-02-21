#!/bin/bash

set -e

# Initialize admin user
if [ -n "$MC_ADMIN_PASSWD" ]; then
    echo "Creating admin user..."
    useradd -m -s /bin/bash -d /home/users/admin admin 2>/dev/null || true
    echo "admin:$MC_ADMIN_PASSWD" | chpasswd
    usermod -aG sudo admin
    echo "Admin user created successfully"
else
    echo "Warning: MC_ADMIN_PASSWD not set, using default password 'admin'"
    useradd -m -s /bin/bash -d /home/users/admin admin 2>/dev/null || true
    echo "admin:admin" | chpasswd
    usermod -aG sudo admin
fi

# Start the MultiChamber server
cd /app/server
exec node dist/index.js
