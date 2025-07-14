package main

import (
	"log/slog"
	"os"
	"runtime/debug"

	"github.com/wajeht/bang/internal/env"
)

type email struct {
	host     string
	port     int
	secure   string
	user     string
	password string
	from     string
}

type app struct {
	appUrl     string
	appPort    int
	env        string
	adminEmail string
}

type cloudflare struct {
	trunstilesitekey   string
	trunstilesecretkey string
}

type notify struct {
	url     string
	xApiKey string
}

type config struct {
	app        app
	email      email
	notify     notify
	cloudflare cloudflare
}

type application struct {
	config config
	logger *slog.Logger
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

func run(logger *slog.Logger) error {
	var cfg config

	cfg.app.appUrl = env.GetString("APP_URL", "http://localhost:80")
	cfg.app.appPort = env.GetInt("APP_PORT", 80)

	app := &application{
		config: cfg,
		logger: logger,
	}

	return app.serveHTTP()
}
