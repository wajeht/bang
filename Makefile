push:
	@git auto

build:
	@go build -o ./src/bang ./src

dev:
	$(shell go env GOPATH)/bin/air -c ./.air.toml
