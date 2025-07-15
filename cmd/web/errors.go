package main

import "net/http"

func (app *application) notFoundErrorHandler(w http.ResponseWriter, r *http.Request) {
	message := "The requested resource could not be found"
	http.Error(w, message, http.StatusNotFound)
}

func (app *application) serverErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	message := "The server encountered a problem and could not process your request"
	http.Error(w, message, http.StatusInternalServerError)
}
