up:
	docker compose up

up-d:
	docker compose up -d

log:
	docker compose logs -f

down:
	docker compose down

build-ui:
	docker compose exec app npm run build:ui

clean:
	docker compose down --rmi all

wipe:
	docker system prune -a --volumes

test:
	docker compose exec app npm run test

lint:
	docker compose exec app npm run lint

format:
	docker compose exec app npm run format
