package main

import (
	"fmt"
	"log/slog"
	"sync"
)

type app struct {
	baseUrl  string
	httpPort int
}

type email struct {
	host     string
	port     int
	secure   bool
	user     string
	password string
	from     string
}

type config struct {
	app   app
	email email
}

type application struct {
	config config
	logger *slog.Logger
	wg     sync.WaitGroup
}

func main() {
	fmt.Println("bang")
}

func run(logger  *slog.Logger) error {
	var cfg config

	cfg.app.baseUrl = env.GetString("BASE_URL", "http://localhsot")
}
