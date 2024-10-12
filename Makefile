push:
	@git auto

dev:
	$(shell go env GOPATH)/bin/air -c ./.air.toml
