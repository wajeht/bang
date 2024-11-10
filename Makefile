push:
	@make test
	@make lint
	@make format
	@git add -A
	@curl -s http://commit.jaw.dev/ | sh -s -- --no-verify
	@git push --no-verify

format:
	@npm run format

lint:
	@npm run lint

test:
	@npm run test
