package main

import (
	"io"
	"net/http"

	"github.com/wajeht/bang/assets"
)

func (app *application) getHomePageHandler(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("geHomePageHandler()"))
}

func (app *application) getRobotsDotTxtHandler(w http.ResponseWriter, r *http.Request) {
	f, err := assets.EmbeddedFiles.Open("static/robots.txt")
	if err != nil {
		app.serverErrorHandler(w, r, err)
	}
	defer f.Close()

	w.Header().Set("Content-Type", "text/plain")
	io.Copy(w, f)
}

func (app *application) getFaviconDotIcoHadnler(w http.ResponseWriter, r *http.Request) {
	f, err := assets.EmbeddedFiles.Open("static/favicon.ico")
	if err != nil {
		app.serverErrorHandler(w, r, err)

	}
	defer f.Close()

	w.Header().Set("Content-Type", "image/x-icon")
	io.Copy(w, f)
}

func (app *application) notFoundErrorHandler(w http.ResponseWriter, r *http.Request) {
	message := "The requested resource could not be found"
	http.Error(w, message, http.StatusNotFound)
}

func (app *application) serverErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	message := "The server encountered a problem and could not process your request"
	http.Error(w, message, http.StatusInternalServerError)
}
