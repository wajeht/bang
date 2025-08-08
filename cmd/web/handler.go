package main

import (
	"io"
	"net/http"

	"github.com/wajeht/bang/assets"
)

func (app *application) handleHome(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("ok"))
}

func (app *application) handleRobots(w http.ResponseWriter, r *http.Request) {
	f, err := assets.EmbeddedFiles.Open("static/robots.txt")
	if err != nil {
		http.NotFound(w, r)

	}
	defer f.Close()

	w.Header().Set("Content-Type", "text/plain")
	io.Copy(w, f)
}

func (app *application) handleFavicon(w http.ResponseWriter, r *http.Request) {
	f, err := assets.EmbeddedFiles.Open("static/favicon.ico")
	if err != nil {
		http.NotFound(w, r)
	}
	defer f.Close()

	w.Header().Set("Content-Type", "image/x-icon")
	io.Copy(w, f)
}
