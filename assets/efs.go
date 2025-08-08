package assets

import (
	"embed"
)

//go:embed "templates" "static" "posts"
var EmbeddedFiles embed.FS
