dev:
	@go run github.com/cosmtrek/air@v1.43.0 \
		--build.cmd "make build" --build.bin "./bin/bang" --build.delay "100" \
		--build.exclude_dir "" \
		--build.include_ext "go, tpl, tmpl, html, css, scss, js, ts, sql, jpeg, jpg, gif, png, bmp, svg, webp, ico, md" \
		--misc.clean_on_exit "true"

build:
	@go build -o ./bin/bang ./cmd/web/

rmds:
	@find . -name '.DS_Store' -delete

push:
	@git add -A
	@curl -s https://commit.jaw.dev/ | sh
	@git push --no-verify

deploy:
	@git auto
	@export $(shell grep -E 'CAPROVER_' .env | xargs) && \
	@caprover deploy --caproverUrl $$CAPROVER_DOMAIN --appToken $$CAPROVER_APP_TOKEN --appName $$CAPROVER_APP_NAME -b $$CAPROVER_GIT_BRANCH_NAME
