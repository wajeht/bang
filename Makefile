push:
	@git auto

dev:
	@go run main.go

build-ui:
	@cd ./web/ui && npm run build
