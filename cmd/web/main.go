package main

import (
	"fmt"
	"log/slog"
)

type config struct {
	baseUrl string
	httpPort int
}

type application struct {
	config config
	logger *slog.Logger
}

func Run(logger *slog.Logger) error {

	var cfg config

	cfg.baseUrl = 

}
