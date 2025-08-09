package search

import (
	"fmt"
	"net/http"
)

type search struct {
	w     http.ResponseWriter
	r     *http.Request
	query string
}

func Search(search search) {
	fmt.Println("search")
}
