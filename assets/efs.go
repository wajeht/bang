package assets

import "embed"

//go:embed "static" "templates"
var Embeddedfiles embed.FS
