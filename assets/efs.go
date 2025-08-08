package assets

import (
	"embed"
)

//go:embed templates/* static/*
var EmbeddedFiles embed.FS
