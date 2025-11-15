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
	@git command -m "Untrack files in .gitignore"

test:
	@go test ./...

format:
	@go mod tidy -v
	@go fmt ./...

dev:
	@go run github.com/cosmtrek/air@v1.43.0 \
		--build.cmd "make build" --build.bin "./command" --build.delay "100" \
		--build.exclude_dir "" \
		--build.include_ext "go, tpl, tmpl, html, css, scss, js, ts, sql, jpeg, jpg, gif, png, bmp, svg, webp, ico, md" \
		--misc.clean_on_exit "true"

lint:
	@echo "lint is not available yet"

build:
	@go build -o ./command ./cmd/web

run: build
	@./command

deploy:
	@./scripts/deploy.sh

pull-prod-db:
	@./scripts/db.sh pull

push-prod-db:
	@./scripts/db.sh push

clean:
	@rm -f command*
