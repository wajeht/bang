https://github.com/user-attachments/assets/7c4104ad-5ad4-4aca-a3b8-d258f9ec300f

# ‼️ Bang

[![Node.js CI](https://github.com/wajeht/bang/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wajeht/bang/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open Source Love svg1](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/wajeht/bang)

DuckDuckGo's !Bangs, but on steroids.

## 📖 Usage

### 🔍 Setup Custom Search Engine in Your Browser

1. In your browser settings, add a new search engine:

   - **Name**: Whatever you prefer (e.g., "Bang")
   - **Shortcut**: `bd` (or any keyword you prefer)
   - **URL**: `http://bang.jaw.dev/?q=%s`

2. Now you can use Bang directly from your browser's address bar:
   ```
   !bm https://bang.jaw.dev
   ```

### ⚙️ How to Add Custom Search Engine

- **Chrome**: Settings → Search Engines → Manage Search Engines → Add
- **Firefox**: Bookmarks → Manage Bookmarks → Right-click → New Bookmark → Add %s in URL
- **Edge**: Settings → Privacy, search, and services → Address bar and search → Manage search engines → Add

### 🔖 Browser Bookmarklet

```javascript
javascript: (function () {
	const link = encodeURIComponent(window.location.href);
	window.location.href = 'http://bang.jaw.dev/?q=!bm ' + link;
})();
```

## 📑 Docs

- See [ROADMAP](./docs/roadmap.md) for `roadmap` guide.
- See [DEVELOPMENT](./docs/development.md) for `development` guide.
- See [CONTRIBUTION](./docs/contribution.md) for `contribution` guide.

## 📜 License

Distributed under the MIT License © [wajeht](https://github.com/wajeht). See [LICENSE](./LICENSE) for more information.
