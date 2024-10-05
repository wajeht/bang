package main

import (
	"fmt"
	"net/http"
)

func getHomePageHandler(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("hello"))
}

func main() {
	fmt.Println("main.go")
	mux := http.NewServeMux()
	mux.HandleFunc("/", getHomePageHandler)
	http.ListenAndServe(":8080", mux)
}
