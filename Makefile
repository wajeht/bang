# Docker compose shorthand
DC := docker compose -f docker-compose.dev.yml
EXEC := $(DC) exec bang
DCDB ?= npx tsx $(HOME)/Dev/dcdb/src/index.ts
SQLITE3 ?= sqlite3
PROD_DOCKER_HOST ?= ssh://jaw@192.168.4.161
PROD_COMPOSE_PROJECT ?= bang
PROD_COMPOSE_SERVICE ?= bang
PROD_DB_PATH ?= /usr/src/app/dist/src/db/sqlite/db.sqlite
LOCAL_DB_FILE ?= ./src/db/sqlite/db.sqlite
LOCAL_DB_BACKUP_DIR ?= ./src/db/sqlite/import-backups
PROD_DB_DUMP ?= ./src/db/sqlite/bang-prod.sql.gz

.PHONY: help push test lint format up down shell deploy pull-prod-db restore-prod-db sync-prod-db

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development:"
	@echo "  up          Start dev server (fresh db)"
	@echo "  up-d        Start dev server in background"
	@echo "  down        Stop dev server"
	@echo "  restart     Restart dev server"
	@echo "  log         Follow container logs"
	@echo "  shell       Open shell in container"
	@echo ""
	@echo "Testing:"
	@echo "  test        Run all tests (unit + browser)"
	@echo "  test-unit   Run unit tests only"
	@echo "  test-watch  Run unit tests in watch mode"
	@echo "  test-browser Run browser tests"
	@echo "  test-coverage Run tests with coverage"
	@echo ""
	@echo "Code Quality:"
	@echo "  lint        Run linter"
	@echo "  format      Format code"
	@echo "  typecheck   Run TypeScript type checking"
	@echo "  check       Run lint + format + typecheck"
	@echo ""
	@echo "Database:"
	@echo "  db-migrate  Run migrations"
	@echo "  db-rollback Rollback last migration"
	@echo "  db-seed     Run seeders"
	@echo "  db-reset    Rollback + migrate + seed"
	@echo "  pull-prod-db Pull production database dump"
	@echo "  restore-prod-db Restore downloaded prod dump locally"
	@echo "  sync-prod-db Pull + restore production database locally"
	@echo ""
	@echo "Deployment:"
	@echo "  push        Test + lint + format + commit + push"
	@echo "  deploy      Deploy to production"
	@echo "  clean       Remove all containers and volumes"

# === Development ===

up:
	@rm -rf ./src/db/sqlite/*sqlite*
	@$(DC) up

up-d:
	@$(DC) up -d

down:
	@$(DC) down

restart:
	@$(DC) restart bang

log:
	@$(DC) logs -f

shell:
	@$(EXEC) sh

# === Testing ===

test:
	@$(MAKE) test-unit
	@$(MAKE) test-browser

test-unit:
	@$(EXEC) npm run test

test-watch:
	@$(EXEC) npm run test -- --watch

test-browser:
	@$(EXEC) npm run test:browser:headless

test-coverage:
	@$(EXEC) npm run test:coverage

# === Code Quality ===

lint:
	@$(EXEC) npm run lint

format:
	@$(EXEC) npm run format

typecheck:
	@$(EXEC) npx tsc --noEmit

check:
	@$(MAKE) lint
	@$(MAKE) format
	@$(MAKE) typecheck

# === Database ===

db-migrate:
	@$(EXEC) npm run db:migrate:latest

db-rollback:
	@$(EXEC) npm run db:migrate:rollback

db-seed:
	@$(EXEC) npm run db:seed:run

db-reset:
	@$(MAKE) db-rollback
	@$(MAKE) db-migrate
	@$(MAKE) db-seed

db-clean:
	@trash ./src/db/sqlite/db.sqlite*

pull-prod-db:
	@DOCKER_HOST=$(PROD_DOCKER_HOST) $(DCDB) -p $(PROD_COMPOSE_PROJECT) -s $(PROD_COMPOSE_SERVICE) --dialect sqlite -d $(PROD_DB_PATH) dump -z $(PROD_DB_DUMP)

restore-prod-db:
	@test -f "$(PROD_DB_DUMP)" || (echo "Missing dump: $(PROD_DB_DUMP)" && exit 1)
	@command -v "$(SQLITE3)" >/dev/null || (echo "Missing sqlite3. Install it or set SQLITE3=/path/to/sqlite3." && exit 1)
	@if lsof "$(LOCAL_DB_FILE)" "$(LOCAL_DB_FILE)-wal" "$(LOCAL_DB_FILE)-shm" >/dev/null 2>&1; then \
		echo "Local DB is open. Stop bang before restoring."; \
		exit 1; \
	fi
	@set -e; \
	tmp_db="$(LOCAL_DB_FILE).tmp"; \
	backup_dir="$(LOCAL_DB_BACKUP_DIR)/$$(date +%Y%m%d-%H%M%S)"; \
	rm -f "$$tmp_db" "$$tmp_db-wal" "$$tmp_db-shm"; \
	gzip -dc "$(PROD_DB_DUMP)" | "$(SQLITE3)" "$$tmp_db"; \
	test "$$("$(SQLITE3)" "$$tmp_db" 'PRAGMA integrity_check;')" = "ok"; \
	mkdir -p "$$backup_dir"; \
	for f in "$(LOCAL_DB_FILE)" "$(LOCAL_DB_FILE)-wal" "$(LOCAL_DB_FILE)-shm"; do \
		if [ -e "$$f" ]; then cp -p "$$f" "$$backup_dir/$$(basename "$$f")"; fi; \
	done; \
	mv "$$tmp_db" "$(LOCAL_DB_FILE)"; \
	rm -f "$(LOCAL_DB_FILE)-wal" "$(LOCAL_DB_FILE)-shm"; \
	echo "Restored $(LOCAL_DB_FILE). Backup: $$backup_dir"

sync-prod-db: pull-prod-db restore-prod-db

# === Deployment ===

push:
	@$(MAKE) test
	@$(MAKE) lint
	@$(MAKE) format
	@git add -A
	@curl -s http://commit.jaw.dev/ | sh -s -- --no-verify
	@git push --no-verify

clean:
	@$(DC) down --rmi all --volumes --remove-orphans
	@docker system prune -a -f
	@docker volume prune -f
	@docker network prune -f

# === Misc ===

fix-git:
	@git rm -r --cached . -f
	@git add .
	@git commit -m "Untrack files in .gitignore"
