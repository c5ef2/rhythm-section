#!/bin/bash
set -e

cd "$(dirname "$0")/.devcontainer"

echo "Starting services..."
docker compose up -d --build

echo "Initializing firewall..."
docker compose exec devcontainer sudo /usr/local/bin/init-firewall.sh

echo "Opening Claude Code..."
docker compose exec -it -u node devcontainer zsh -c "claude --dangerously-skip-permissions"