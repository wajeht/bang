package main

import (
	"log/slog"
	"os"
	"runtime/debug"
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

func run(logger *slog.Logger) error {
	var cfg config

	cfg.app.url = env.GetString("APP_URL", "http://localhost")
	cfg.app.port = env.GetInt("APP_PORT", 80)
	cfg.app.env = env.GetString("APP_ENV", "development")
	cfg.app.adminEmail = env.GetString("APP_ADMIN_EMAIL", "admin@localhost")

	cfg.email.host = env.GetString("EMAIL_HOST", "mailpit")
	cfg.email.port = env.GetInt("EMAIL_HOST", 1025)
	cfg.email.secure = env.GetBool("EMAIL_SECURE", false)
	cfg.email.username = env.GetString("EMAIL_USERNAME", "username")
	cfg.email.password = env.GetString("EMAIL_PASSWORD", "password")
	cfg.email.fromEmail = env.GetString("EMAIL_FROM", "noreply@localhost")

	cfg.notify.url = env.GetString("NOTIFY_URL", "localhost")
	cfg.notify.xApiKey = env.GetString("NOTIFY_X_API_KEY", "x-api-key")

	cfg.cloudflare.turnSiteSecretKey = env.GetString("CLOUDFLARE_TURNSTILE_SITE_KEY", "site-key")
	cfg.cloudflare.turnSiteSecretKey = env.GetString("CLOUDFLARE_TURNSTILE_SECRET_KEY", "secret-key")

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
