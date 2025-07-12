package main

import "net/http"

func (app *application) notFoundErrorHandler(w http.ResponseWriter, r *http.Request) {
	message := "The requested resource could not be found"
	http.Error(w, message, http.StatusNotFound)
}
