package main

import (
	"fmt"
	"log/slog"
	"sync"

	"github.com/wajeht/bang/internal/env"
)

type config struct {
	app struct {
		url        string
		env        string
		port       int
		adminEmail string
	}
	email struct {
		host      string
		port      int
		secure    bool
		username  string
		password  string
		fromEmail string
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

	cfg.app.url = env.GetString("APP_URL", "http://localhsot")
	cfg.app.port = env.GetInt("APP_PORT", 80)

	app := &application{
		config: cfg,
		logger: logger,
	}

	return app.serveHTTP()
}
