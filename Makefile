push:
	@git auto

build:
	@go build -o ./bin/bang ./src

start:
	@./bin/bang

dev:
	$(shell go env GOPATH)/bin/air -c ./.air.toml
