package search

import (
	"fmt"
	"net/http"
)

type search struct {
	W     http.ResponseWriter
	R     *http.Request
	Query string
	User  *string
}

func Search(search search) {
	fmt.Println("search")
}
