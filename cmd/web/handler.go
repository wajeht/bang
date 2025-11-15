package main

import (
	"fmt"
	"net/http"
)

func (app *application) handleHome(r http.ResponseWriter, w *http.Request) {
	fmt.Println("hanleHome()")
}
