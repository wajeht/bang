dev:
	@go run github.com/cosmtrek/air@v1.43.0 \
		--build.cmd "make build" --build.bin "/tmp/bin/web" --build.delay "100" \
		--build.exclude_dir "" \
		--build.include_ext "go, tpl, tmpl, html, css, scss, js, ts, sql, jpeg, jpg, gif, png, bmp, svg, webp, ico, md" \
		--misc.clean_on_exit "true"
build:
	@go build -o=/tmp/bin/web ./cmd/web

commit:
	@git add -A
	@git auto

push:
	@go test ./...
	@go fmt ./...
	@git add -A
	@git auto
	@git push --no-verify

test:
	@go test ./...

format:
	@go mod tidy -v
	@go fmt ./...

fix-git:
	@git rm -r --cached . -f
	@git add .
	@git commit -m "Untrack files in .gitignore"

deploy:
	@./scripts/deploy.sh

shell:
	@docker compose -f docker-compose.dev.yml exec bang sh

pull-prod-db:
	@./scripts/db.sh pull

push-prod-db:
	@./scripts/db.sh push
