package main

import (
	"net/http"

	"github.com/wajeht/bang/assets"
)

func (app *application) routes() http.Handler {
	mux := http.NewServeMux()

	fileServer := http.FileServer(http.FS(assets.EmbeddedFiles))

	mux.Handle("GET /static/", app.neuterMiddleware(fileServer))

	mux.HandleFunc("GET /{$}", app.getHomePageHandler)

	mux.HandleFunc("GET /robots.txt", app.getRobotsDotTxtHandler)

	mux.HandleFunc("GET /favicon.ico", app.getFaviconDotIcoHadnler)

	return mux
}
