#!/bin/bash
set -e

source .env

LOCAL_DIR="./src/db/sqlite"
REMOTE_DIR="~/databases/bang"

usage() {
    echo "Usage: $0 {pull|push}"
    echo "  pull - Sync database files from production to local"
    echo "  push - Sync database files from local to production"
    exit 1
}

pull_db() {
    echo "🔄 Pulling database from production..."

    mkdir -p "$LOCAL_DIR"

    rm -rf "$LOCAL_DIR"/*.sqlite*

    echo "Syncing database files..."
    rsync -avz "$PRODUCTION_SSH_URL:$REMOTE_DIR/*.sqlite*" "$LOCAL_DIR/"

    echo "✨ Database files synchronized"

    DB_FILE=$(ls "$LOCAL_DIR"/*.sqlite | head -n 1) # Get the first SQLite file
    if [[ -f "$DB_FILE" ]]; then
        echo "Updating migration filenames in the database..."
        sqlite3 "$DB_FILE" "UPDATE knex_migrations SET name = REPLACE(name, '.js', '.ts') WHERE name LIKE '%.js';"
        echo "✅ Migration filenames updated."
    else
        echo "⚠️ No SQLite database file found in $LOCAL_DIR"
    fi
}

push_db() {
    echo "🚀 Pushing database to production..."

    if [[ ! -f "$LOCAL_DIR"/*.sqlite ]]; then
        echo "Error: No local database files found in $LOCAL_DIR"
        exit 1
    fi

    echo "⚠️  WARNING: This will OVERWRITE the production database with your local database."
    echo "⚠️  This action cannot be undone. Make sure you have a backup of the production database."
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Operation cancelled."
        exit 0
    fi

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

    echo "Pushing database files to production..."
    rsync -avz "$LOCAL_DIR"/*.sqlite* "$PRODUCTION_SSH_URL:$REMOTE_DIR/"

    echo "✨ Database files synchronized to production"
    echo "A backup was created at $BACKUP_DIR"
}

main() {
    if [[ $# -eq 0 ]]; then
        echo "Error: No argument provided"
        usage
    fi

    if [[ "$NODE_ENV" == "production" || -z "$PRODUCTION_SSH_URL" ]]; then
        echo "Error: Invalid environment or missing PRODUCTION_SSH_URL"
        exit 1
    fi

    local COMMAND=$1

    case $COMMAND in
        pull)
            pull_db
            ;;
        push)
            push_db
            ;;
        *)
            echo "Error: Invalid argument '$COMMAND'"
            usage
            ;;
    esac
}

main "$@"
