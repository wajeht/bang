package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func getApiHealthzHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message":"ok"}`))
}

func getVueAppHandler(w http.ResponseWriter, r *http.Request) {
	path := filepath.Join("./web/dist", r.URL.Path)

	if _, err := os.Stat(path); err == nil {
		ext := strings.ToLower(filepath.Ext(path))

		switch ext {
		case ".js", ".mjs":
			w.Header().Set("Content-Type", "application/javascript")
		case ".css":
			w.Header().Set("Content-Type", "text/css")
		case ".html":
			w.Header().Set("Content-Type", "text/html")
		case ".svg":
			w.Header().Set("Content-Type", "image/svg+xml")
		case ".json":
			w.Header().Set("Content-Type", "application/json")
		}
		http.ServeFile(w, r, path)
		return
	}

	indexPath := filepath.Join("./web/dist", "index.html")

	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		http.Error(w, "index.html not found", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html")

	http.ServeFile(w, r, indexPath)
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/healthz", getApiHealthzHandler)

	mux.HandleFunc("GET /", getVueAppHandler)

	port := "80"

	log.Printf("Server starting on http://localhost:%s", port)

	err := http.ListenAndServe(":"+port, mux)

	if err != nil {
		log.Fatal(err)
	}
}
