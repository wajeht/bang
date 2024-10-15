package main

import (
	"net/http"
)

func routes() *http.ServeMux {
	mux := http.NewServeMux()

	fileServer := http.FileServer(http.Dir("./public"))

	mux.Handle("/", neuter(fileServer))

	mux.HandleFunc("GET /{$}", getHomePageHandler)

	mux.HandleFunc("GET /healthz", getHealthzHandler)

	mux.HandleFunc("GET /terms-of-service", getTermsOfServicePageHandler)

	mux.HandleFunc("GET /privacy-policy", getPrivacyPolicyPageHandler)

	mux.HandleFunc("GET /login", getLoginHandler)

	mux.HandleFunc("GET /oauth/github", getGithubHandler)

	mux.HandleFunc("GET /oauth/github/callback", getGithubCallbackHandler)

	return mux
}
