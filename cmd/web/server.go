package main

import "fmt"

type config struct {
	appPort int
	appEnv  string
}

type application struct {
	config config
}

func serve() {
	var cfg config

	cfg.appEnv = "development"
	cfg.appPort = 80
}
