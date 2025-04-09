package main

import "net/http"

func routes() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", HandlerGetHealthZ)

}
