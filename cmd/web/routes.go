package main

import (
	"net/http"
)

func (app *application) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /{$}", app.getHomePageHandler)

	mux.HandleFunc("GET /robots.txt", app.getRobotsDotTxtHandler)

	mux.HandleFunc("GET /favicon.ico", app.getFaviconDotIcoHadnler)

	return mux
}
