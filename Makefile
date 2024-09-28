up:
	@docker compose up

up-d:
	@docker compose up -d

log:
	@docker compose logs -f

down:
	@docker compose down

build-ui:
	@docker compose exec bang npm run build:ui

clean:
	@docker compose down --rmi all

wipe:
	@docker system prune -a --volumes

test:
	@docker compose exec bang npm run test

lint:
	@docker compose exec bang npm run lint

format:
	@docker compose exec bang npm run format

push:
	@git auto
