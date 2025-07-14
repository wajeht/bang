package main

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
)

func (app *application) serveHTTP() error {
	srv := &http.Server{
		Addr:     fmt.Sprintf(":%d", app.config.app.appPort),
		Handler:  app.routes(),
		ErrorLog: slog.NewLogLogger(app.logger.Handler(), slog.LevelWarn),
	}

	app.logger.Info("starting server", slog.Group("server", "addr", srv.Addr))

	err := srv.ListenAndServe()

	if errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}
