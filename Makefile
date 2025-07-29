push:
	@make test
	@make lint
	@make format
	@git add -A
	@curl -s http://commit.jaw.dev/ | sh -s -- --no-verify
	@git push --no-verify

fix-git:
	@git rm -r --cached . -f
	@git add .
	@git commit -m "Untrack files in .gitignore"

test:
	@make test-unit
	@make test-browser

test-unit:
	@docker compose -f docker-compose.dev.yml exec bang npm run test

test-coverage:
	@docker compose -f docker-compose.dev.yml exec bang npm run test:coverage

test-browser:
	@docker compose -f docker-compose.dev.yml exec bang npm run test:browser:headless

format:
	@docker compose -f docker-compose.dev.yml exec bang npm run format

lint:
	@docker compose -f docker-compose.dev.yml exec bang npm run lint

deploy:
	@./scripts/deploy.sh

shell:
	@docker compose -f docker-compose.dev.yml exec bang sh

db-migrate:
	@docker compose -f docker-compose.dev.yml exec bang npm run db:migrate:latest

db-rollback:
	@docker compose -f docker-compose.dev.yml exec bang npm run db:migrate:rollback

db-seed:
	@docker compose -f docker-compose.dev.yml exec bang npm run db:seed:run

pull-prod-db:
	@./scripts/db.sh pull

push-prod-db:
	@./scripts/db.sh push

db-reset:
	make db-rollback
	make db-migrate
	make db-seed

up:
	@rm -rf ./src/db/sqlite/*sqlite*
	@docker compose -f docker-compose.dev.yml up

up-d:
	@docker compose -f docker-compose.dev.yml up -d

log:
	@docker compose -f docker-compose.dev.yml logs -f

down:
	@docker compose -f docker-compose.dev.yml down

clean:
	@docker compose -f docker-compose.dev.yml down --rmi all --volumes --remove-orphans
	@docker system prune -a -f
	@docker volume prune -f
	@docker network prune -f
