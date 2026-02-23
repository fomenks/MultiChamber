#!/bin/bash
echo "Restarting MultiChamber server..."
docker compose restart multichamber
echo "Waiting 3 seconds for server to start..."
sleep 3
echo "Testing /mc13/chamber/ endpoint..."
curl -s http://localhost:8123/mc13/chamber/ -w "\nHTTP Status: %{http_code}\n"