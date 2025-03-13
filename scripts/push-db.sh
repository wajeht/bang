#!/bin/bash
set -e

source .env

# Check environment and configuration
if [[ "$NODE_ENV" == "production" || -z "$PRODUCTION_SSH_URL" ]]; then
    echo "Error: Invalid environment or missing PRODUCTION_SSH_URL"
    exit 1
fi

LOCAL_DIR="./src/db/sqlite"
REMOTE_DIR="~/databases/bang"

# Check if local database exists
if [[ ! -f "$LOCAL_DIR"/*.sqlite ]]; then
    echo "Error: No local database files found in $LOCAL_DIR"
    exit 1
fi

# Prompt for confirmation
echo "⚠️  WARNING: This will OVERWRITE the production database with your local database."
echo "⚠️  This action cannot be undone. Make sure you have a backup of the production database."
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
fi

# Create backup of production database
echo "Creating backup of production database..."
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="$REMOTE_DIR/backup_$TIMESTAMP"
ssh $PRODUCTION_SSH_URL "mkdir -p $BACKUP_DIR && cp $REMOTE_DIR/*.sqlite* $BACKUP_DIR/ 2>/dev/null || echo 'No existing database to backup.'"

# Update 'knex_migrations' table: change all 'name' fields to use the .js extension
DB_FILE=$(ls "$LOCAL_DIR"/*.sqlite | head -n 1) # Get the first SQLite file
if [[ -f "$DB_FILE" ]]; then
    echo "Updating migration filenames in the database..."
    sqlite3 "$DB_FILE" "UPDATE knex_migrations SET name = REPLACE(name, '.ts', '.js') WHERE name LIKE '%.ts';"
    echo "✅ Migration filenames updated."
fi

# Push local database to production
echo "Pushing database files to production..."
rsync -avz "$LOCAL_DIR"/*.sqlite* "$PRODUCTION_SSH_URL:$REMOTE_DIR/"

echo "✨ Database files synchronized to production"
echo "A backup was created at $BACKUP_DIR"
