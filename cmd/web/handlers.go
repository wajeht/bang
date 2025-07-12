package main

import (
	"fmt"
	"net/http"
)

func (app *application) getHomePageHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("getHomeHandler()")
}

func (app *application) getRobotsDotTxtHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("getRobotsDotTXTHandler()")
}

func (app *application) getFaviconDotIcoHadnler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("getFaviconDotIcoHadnler()")
}
