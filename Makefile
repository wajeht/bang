# Docker compose shorthand
DC := docker compose -f docker-compose.dev.yml
EXEC := $(DC) exec bang

.PHONY: help push test lint format up down shell deploy

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
	@echo "  pull-prod-db Pull production database"
	@echo "  push-prod-db Push to production database"
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

pull-prod-db:
	@./scripts/db.sh pull

push-prod-db:
	@./scripts/db.sh push

# === Deployment ===

push:
	@$(MAKE) test
	@$(MAKE) lint
	@$(MAKE) format
	@git add -A
	@curl -s http://commit.jaw.dev/ | sh -s -- --no-verify
	@git push --no-verify

deploy:
	@./scripts/deploy.sh

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
