#!/bin/bash

source .env

if [ "$NODE_ENV" = "production" ]; then
  echo "Error: Script cannot run in production environment."
  exit 1
fi

if [ -z "$PRODUCTION_SSH_URL" ]; then
  echo "Error: PRODUCTION_SSH_URL is not set in .env file"
  exit 1
fi

LOCAL_DIR="./src/db/sqlite"
REMOTE_PATH="$PRODUCTION_SSH_URL:~/databases/bang/*.sqlite*"

# don't use rm -rf
trash ./src/db/sqlite/*.sqlite*

scp "$REMOTE_PATH" "$LOCAL_DIR"

echo "Files copied successfully."
