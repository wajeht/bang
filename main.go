package main

import (
	"log"
	"net/http"
)

func main() {
	router := routes()

	port := "80"

	log.Printf("Server starting on http://localhost:%s", port)

	err := http.ListenAndServe(":"+port, router)

	if err != nil {
		log.Fatal(err)
	}
}
