package main

import (
	"html/template"
	"log"
	"net/http"
	"path/filepath"
	"strings"
)

// templates is a map that will store all our parsed templates
var templates map[string]*template.Template

// init function runs automatically when the package is initialized
func init() {
	// Initialize the templates map
	templates = make(map[string]*template.Template)

	// Get all layout files from the layouts directory
	layouts, err := filepath.Glob("src/layouts/*.html")
	if err != nil {
		log.Fatal(err)
	}

	// Get all page files from the pages directory
	pages, err := filepath.Glob("src/pages/*.html")
	if err != nil {
		log.Fatal(err)
	}

	// Generate templates by combining layouts, pages, and components
	for _, layout := range layouts {
		for _, page := range pages {
			// Start with layout and page files
			files := []string{layout, page}

			// Get all partial templates (components) from the components directory
			partials, err := filepath.Glob("src/components/*.html")
			if err != nil {
				log.Fatal(err)
			}
			// Add partials to the files slice
			files = append(files, partials...)

			// Generate a unique name for this template combination
			layoutName := filepath.Base(layout)
			pageName := filepath.Base(page)
			templateName := strings.TrimSuffix(layoutName, ".html") + "_" + strings.TrimSuffix(pageName, ".html")

			// Parse all files and store the resulting template in the templates map
			templates[templateName] = template.Must(template.ParseFiles(files...))
		}
	}
}

// renderTemplate renders a specific template with given data
func renderTemplate(w http.ResponseWriter, layout, page string, data interface{}) {
	// Generate the template name based on layout and page
	templateName := strings.TrimSuffix(layout, ".html") + "_" + strings.TrimSuffix(page, ".html")

	// Retrieve the template from the templates map
	tmpl, ok := templates[templateName]
	if !ok {
		// If template is not found, return a 500 error
		http.Error(w, "Template not found", http.StatusInternalServerError)
		return
	}

	// Execute the template, passing in the data
	err := tmpl.ExecuteTemplate(w, filepath.Base(layout), data)
	if err != nil {
		// If there's an error executing the template, return a 500 error
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
