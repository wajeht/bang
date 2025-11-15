package main

import (
	"log/slog"
	"os"
	"runtime/debug"
	"sync"
)

type config struct {
	appPort int
	appEnv  string
	appUrl  string

	sessionSecret string
	sessionDomain string
	sessionSalt   string

	emailHost     string
	emailPort     int
	emailUser     string
	emailPassword string
	emailFrom     string

	notifyUrl     string
	notifyXApiKey string

	cloudflareTurnstileSiteKey   string
	cloudflareTurnstileSecretKey string
}

type application struct {
	config config
	logger *slog.Logger
	wg     sync.WaitGroup
}

func run(logger *slog.Logger) error {
	var cfg config

	cfg.appEnv = "development"
	cfg.appPort = 80

	app := &application{
		config: cfg,
		logger: logger,
	}

	return app.serveHTTP()
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	err := run(logger)
	if err != nil {
		trace := string(debug.Stack())
		logger.Error(err.Error(), "trace", trace)
		os.Exit(1)
	}
}
