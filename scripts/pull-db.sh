#!/bin/bash
set -e

source .env

# Check environment and configuration
if [[ "$NODE_ENV" == "production" || -z "$PRODUCTION_SSH_URL" ]]; then
    echo "Error: Invalid environment or missing PRODUCTION_SSH_URL"
    exit 1
fi

LOCAL_DIR="./src/db/sqlite"
mkdir -p "$LOCAL_DIR"

# Remove local database files
rm -rf "$LOCAL_DIR"/*.sqlite*

# Backup and sync database files
echo "Syncing database files..."
rsync -avz "$PRODUCTION_SSH_URL:~/databases/bang/*.sqlite*" "$LOCAL_DIR/"

echo "✨ Database files synchronized"

# Update 'knex_migrations' table: change all 'name' fields to use the .ts extension
DB_FILE=$(ls "$LOCAL_DIR"/*.sqlite | head -n 1) # Get the first SQLite file
if [[ -f "$DB_FILE" ]]; then
    echo "Updating migration filenames in the database..."
    sqlite3 "$DB_FILE" "UPDATE knex_migrations SET name = REPLACE(name, '.js', '.ts') WHERE name LIKE '%.js';"
    echo "✅ Migration filenames updated."
else
    echo "⚠️ No SQLite database file found in $LOCAL_DIR"
fi
