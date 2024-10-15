# Variables
BINARY_NAME=bang
MAIN_PACKAGE=./src
GO_FILES=$(shell find . -name '*.go' -not -path "./vendor/*")

# Targets
.PHONY: all build clean run test cover fmt lint vet install dev push

all: build

build:
	@echo "Building..."
	@go build -o ./bin/$(BINARY_NAME) $(MAIN_PACKAGE)

clean:
	@echo "Cleaning..."
	@rm -rf ./bin
	@go clean

run: build
	@echo "Running..."
	@./bin/$(BINARY_NAME)

test:
	@echo "Running tests..."
	@go test -v ./...

cover:
	@echo "Running tests with coverage..."
	@go test -coverprofile=coverage.out ./...
	@go tool cover -html=coverage.out

fmt:
	@echo "Formatting code..."
	@gofmt -s -w $(GO_FILES)

lint:
	@echo "Linting code..."
	@golint ./...

vet:
	@echo "Vetting code..."
	@go vet ./...

install:
	@echo "Installing dependencies..."
	@go mod download

dev:
	@echo "Running in development mode..."
	@$(shell go env GOPATH)/bin/air -c ./.air.toml

push:
	@echo "Pushing to repository..."
	@git auto

start: build
	@echo "Starting the application..."
	@./bin/$(BINARY_NAME)
