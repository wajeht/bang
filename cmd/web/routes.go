package main

import (
	"net/http"

	"github.com/wajeht/bang/assets"
)

func (app *application) routes() http.Handler {
	mux := http.NewServeMux()

	fileServer := http.FileServer(http.FS(assets.EmbeddedFiles))

	mux.Handle("GET /static/", app.neuter(fileServer))

	mux.HandleFunc("GET /favicon.ico", app.HanldeFavicon)

	mux.HandleFunc("GET /robots.txt", app.HandleRobots)

	mux.HandleFunc("GET /{$}", app.HanldeHome)

	return mux
}
