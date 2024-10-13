package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func neuter(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Remove leading "/" and clean the path
		path := strings.TrimPrefix(r.URL.Path, "/")
		cleanPath := filepath.Clean(path)

		// Check if the file exists in the public directory
		fullPath := filepath.Join("./public", cleanPath)
		fileInfo, err := os.Stat(fullPath)

		if err != nil || fileInfo.IsDir() {
			// File doesn't exist or is a directory
			notFoundHandler(w, r)
			return
		}

		next.ServeHTTP(w, r)
	})
}
