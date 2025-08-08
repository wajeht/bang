package main

import (
	"fmt"
	"log/slog"
	"sync"

	"github.com/wajeht/bang/internal/env"
)

type config struct {
	app struct {
		baseUrl  string
		httpPort int
	}
	email struct {
		host     string
		port     int
		secure   bool
		user     string
		password string
		from     string
	}
	notify struct {
		url     string
		xApiKey string
	}
	cloudflare struct {
		turnSiteSiteKey   string
		turnSiteSecretKey string
	}
}

type application struct {
	config config
	logger *slog.Logger
	wg     sync.WaitGroup
}

func main() {
	fmt.Println("bang")
}

func run(logger *slog.Logger) error {
	var cfg config

	cfg.app.baseUrl = env.GetString("BASE_URL", "http://localhsot")
	cfg.app.httpPort = env.GetInt("HTTP_PORT", 80)

	app := &application{
		config: cfg,
		logger: logger,
	}

	return app.serveHTTP()
}
