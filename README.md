https://github.com/user-attachments/assets/5f033de3-afa1-44a7-b55b-dc45fc203d10

# ❗️Search

[![Node.js CI](https://github.com/wajeht/search/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wajeht/search/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open Source Love svg1](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/wajeht/search)

DuckDuckGo's !searchs, but on steroids.

## 📖 Usage

### 🔍 Setup Custom Search Engine in Your Browser

Before you can use the search command from your browser's search bar, you need to add the search URL as a custom search engine. Follow these steps:

1. In your browser settings, add a new search engine:

    - **Name**: Whatever you prefer (e.g., "search")
    - **Shortcut**: `bd` (or any keyword you prefer)
    - **URL**: `http://search.jaw.dev/?q=%s`

2. Now you can use search directly from your browser's address bar:
    ```
    !bm https://search.jaw.dev
    ```

### ⚙️ How to Add Custom Search Engine

- **Chrome**: Settings → Search Engines → Manage Search Engines → Add
- **Firefox**: Bookmarks → Manage Bookmarks → Right-click → New Bookmark → Add %s in URL
- **Edge**: Settings → Privacy, search, and services → Address bar and search → Manage search engines → Add

### 🎯 Default Commands

- `@data` - Access data
- `@admin` - Access admin
- `@api` - Access API docs
- `@b`, `@searchs` - Go to home page
- `@s`, `@settings` - Access settings
- `@n`, `@note`, `@notes` - Access your notes
- `@a`, `@action`, `@actions` - Access your actions
- `@bm`, `@bookmark`, `@bookmarks` - Access your bookmarks

### 🎨 Special Commands

- `@bm [search term]` - Search your bookmarks
- `@a [search term]` - Search your actions
- `@n [search term]` - Search your notes
- `!bm [url]` - Add a bookmark
- `!bm [title] [url]` - Add a bookmark
    - `[title]` is optional, if not provided, we will auto fetch the title
    - `[url]` is required
    - eg: `!bm this title can be super long https://search.jaw.dev`
- `!add [trigger] [url]` - Create a custom search
    - `[trigger]` is required
    - `[url]` is required
    - eg: `!add jaw https://search.jaw.dev`
- `!note [title] | [content]` - Create a note
    - `[title]` is optional, if not provided, we will use it as `Untitled`
    - `[content]` is required
    - eg: `!note some title | this is a note https://search.jaw.dev`
    - eg: `!note this is a content without any title`

## 📑 Docs

- See [RECIPE](./docs/recipe.md) for `recipe` guide.
- See [ROADMAP](./docs/roadmap.md) for `roadmap` guide.
- See [DEVELOPMENT](./docs/development.md) for `development` guide.
- See [CONTRIBUTION](./docs/contribution.md) for `contribution` guide.

## 📜 License

Distributed under the MIT License © [wajeht](https://github.com/wajeht). See [LICENSE](./LICENSE) for more information.
