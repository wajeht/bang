https://github.com/user-attachments/assets/5f033de3-afa1-44a7-b55b-dc45fc203d10

# ❗️Bang

[![Node.js CI](https://github.com/wajeht/bang/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wajeht/bang/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open Source Love svg1](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/wajeht/bang)

DuckDuckGo's !Bangs, but on steroids.

<!-- starts -->

## 📖 Usage

### 🔍 Setup Custom Search Engine in Your Browser

Before you can use the Bang command from your browser's search bar, you need to add the Bang URL as a custom search engine. Follow these steps:

1. In your browser settings, add a new search engine:

    - **Name**: Whatever you prefer (e.g., "Bang")
    - **Shortcut**: `bd` (or any keyword you prefer)
    - **URL**: `http://bang.jaw.dev/?q=%s`

2. Now you can use Bang directly from your browser's address bar:
   `!bm https://bang.jaw.dev`

### ⚙️ How to Add Custom Search Engine

- **Chrome**: Settings → Search Engines → Manage Search Engines → Add
- **Firefox**: Bookmarks → Manage Bookmarks → Right-click → New Bookmark → Add %s in URL
- **Edge**: Settings → Privacy, search, and services → Address bar and search → Manage search engines → Add

### 🎯 Default Commands

- `@data` - Access data
- `@admin` - Access admin
- `@api` - Access API docs
- `@b`, `@bangs` - Go to home page
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
    - eg: `!bm this title can be super long https://bang.jaw.dev`
- `!add [trigger] [url]` - Create a custom bang
    - `[trigger]` is required
    - `[url]` is required
    - eg: `!add jaw https://bang.jaw.dev`
- `!del [trigger]` - Delete a custom bang
    - `[trigger]` is required (the bang trigger to delete)
    - eg: `!del jaw` or `!del !jaw`
- `!edit [trigger] [new-trigger]` - Change a bang's trigger
    - `[trigger]` is required (the current bang trigger)
    - `[new-trigger]` is required (the new trigger name)
    - eg: `!edit jaw !newjaw`
- `!edit [trigger] [url]` - Change a bang's URL
    - `[trigger]` is required (the bang trigger to edit)
    - `[url]` is required (the new URL)
    - eg: `!edit jaw https://new-url.com`
- `!edit [trigger] [new-trigger] [url]` - Change both trigger and URL
    - `[trigger]` is required (the current bang trigger)
    - `[new-trigger]` is required (the new trigger name)
    - `[url]` is required (the new URL)
    - eg: `!edit jaw !newjaw https://new-url.com`
- `!note [title] | [content]` - Create a note
    - `[title]` is optional, if not provided, we will use it as `Untitled`
    - `[content]` is required
    - eg: `!note some title | this is a note https://bang.jaw.dev`
    - eg: `!note this is a content without any title`

## 📑 Docs

- See [RECIPE](./docs/recipe.md) for `recipe` guide.
- See [DEVELOPMENT](./docs/development.md) for `development` guide.
- See [CONTRIBUTION](./docs/contribution.md) for `contribution` guide.

<!-- ends -->

## 📜 License

Distributed under the MIT License © [wajeht](https://github.com/wajeht). See [LICENSE](./LICENSE) for more information.
