package assets

import (
	"embed"
)

//go:embed templates/* static/* migrations/* emails/*
var EmbeddedFiles embed.FS
