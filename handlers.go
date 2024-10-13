package main

import (
	"html/template"
	"net/http"
	"path/filepath"
)

func getHealthzHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)

	if r.Header.Get("Content-Type") == "application/json" {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message":"ok"}`))
		return
	}

	tmpl, err := template.ParseFiles(filepath.Join("pages", "healthz.html"))

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err = tmpl.Execute(w, nil)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func getHomePageHandler(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles(filepath.Join("pages", "home.html"))

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)

	err = tmpl.Execute(w, nil)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func notFoundHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotFound)

	if r.Header.Get("Content-Type") == "application/json" {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message":"not found"}`))
		return
	}

	tmpl, err := template.ParseFiles(filepath.Join("pages", "not-found.html"))

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err = tmpl.Execute(w, nil)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
