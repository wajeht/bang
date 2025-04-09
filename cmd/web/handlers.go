package main

import (
	"net/http"
)

func HandlerGetHealthZ(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("HandlerGetHealthZ"))
}
