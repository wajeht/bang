#!/bin/bash
set -e

source .env

# Check environment and config
if [[ "$NODE_ENV" == "production" || -z "$PRODUCTION_SSH_URL" ]]; then
    echo "Error: Invalid environment or missing PRODUCTION_SSH_URL"
    exit 1
fi

LOCAL_DIR="./src/db/sqlite"
mkdir -p "$LOCAL_DIR"

# remove our local db
rm -rf ./src/db/sqlite/*.sqlite*

# Backup and sync database files
echo "Syncing database files..."
rsync -avz "$PRODUCTION_SSH_URL:~/databases/bang/*.sqlite*" "$LOCAL_DIR/"

echo "✨ Database files synchronized"
