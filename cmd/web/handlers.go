package main

import (
	"net/http"
)

func (app *application) getHomePageHandler(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("geHomePageHandler()"))
}

func (app *application) getRobotsDotTxtHandler(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("getRobotsDotTXTHandler()"))
}

func (app *application) getFaviconDotIcoHadnler(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("getFaviconDotIcoHadnler()"))
}
