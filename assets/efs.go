package assets

import (
	"embed"
)

//go:embed "views" "static"
var EmbeddedFiles embed.FS
