package main

import (
	"net/http"
)

func routes() *http.ServeMux {
	mux := http.NewServeMux()

	fileServer := http.FileServer(http.Dir("./public"))

	mux.Handle("/", neuter(fileServer))

	mux.HandleFunc("GET /healthz", getHealthzHandler)

	mux.HandleFunc("GET /{$}", getHomePageHandler)

	return mux
}
