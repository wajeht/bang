package main

import (
	"fmt"
	"log/slog"
)

type config struct {
	appUrl  string
	appPort string
	env     string
}

type application struct {
	config config
	logger *slog.Logger
}

func main() {
	fmt.Println("hello world")
}
