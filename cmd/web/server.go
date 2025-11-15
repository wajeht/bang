package main

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

const (
	defaultIdleTimeout  = time.Minute
	defaultReadTimeout  = 5 * time.Second
	defaultWriteTimeout = 10 * time.Second
)

func (app *application) serveHTTP() error {
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", app.config.appPort),
		Handler:      app.routes(),
		IdleTimeout:  defaultIdleTimeout,
		ReadTimeout:  defaultReadTimeout,
		WriteTimeout: defaultWriteTimeout,
	}

	err := app.serve(srv)
	if err != nil {
		return err
	}

	return nil
}

func (app *application) serve(srv *http.Server) error {
	app.logger.Info("starting server", slog.Group("server", "addr", srv.Addr))

	err := srv.ListenAndServe()
	if !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	app.logger.Info("stopped server", slog.Group("server", "addr", srv.Addr))

	return nil
}
