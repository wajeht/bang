package main

import (
	"fmt"
	"log/slog"
)

type email struct {
	host     string
	port     string
	secure   string
	user     string
	password string
	from     string
}

type app struct {
	appUrl     string
	appPort    string
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
	fmt.Println("hello world")
}
