package main

import (
	"net/http"
)

func (app *application) notFound(w http.ResponseWriter, r *http.Request) {
	message := "The requested resource could not be found"
	http.Error(w, message, http.StatusNotFound)
}

func (app *application) serverError(w http.ResponseWriter, r *http.Request, err error) {
	message := "The server encountered a problem and could not process your request"
	http.Error(w, message, http.StatusInternalServerError)
}

func (app *application) badRequest(w http.ResponseWriter, r *http.Request, err error) {
	http.Error(w, err.Error(), http.StatusBadRequest)
}
