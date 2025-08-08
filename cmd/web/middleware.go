package main

import (
	"net/http"
	"strings"
)

func (app *application) neuter(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/") {
			app.notFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
