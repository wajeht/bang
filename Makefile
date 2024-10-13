push:
	@git auto

build:
	@go build -o ./bin/bang ./src

start:
	@./bin/bang

dev:
	@npm run dev

install:
	@npm install
	@go mod download
