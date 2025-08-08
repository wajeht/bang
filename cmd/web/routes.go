package main

import (
	"net/http"

	"github.com/wajeht/bang/assets"
)

func (app *application) routes() http.Handler {
	mux := http.NewServeMux()

	fileServer := http.FileServer(http.FS(assets.EmbeddedFiles))

	mux.Handle("GET /static/", app.neuter(fileServer))

	mux.HandleFunc("GET /favicon.ico", app.handleFavicon)

	mux.HandleFunc("GET /robots.txt", app.handleRobots)

	mux.HandleFunc("GET /{$}", app.handleHome)

	return mux
}
