package main

import (
	"net/http"
)

func getHealthzHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)

	if r.Header.Get("Content-Type") == "application/json" {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message":"ok"}`))
		return
	}

	renderTemplate(w, "public.html", "healthz.html", nil)
}

func notFoundHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotFound)

	if r.Header.Get("Content-Type") == "application/json" {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message":"not found"}`))
		return
	}

	renderTemplate(w, "public.html", "not-found.html", nil)
}

func getPrivacyPolicyPageHandler(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, "public.html", "privacy-policy", nil)
}

func getTermsOfServicePageHandler(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, "public.html", "terms-of-service.html", nil)
}

func getHomePageHandler(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, "public.html", "home.html", nil)
}
