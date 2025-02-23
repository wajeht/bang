https://github.com/user-attachments/assets/5f033de3-afa1-44a7-b55b-dc45fc203d10

# ‼️ Bang

[![Node.js CI](https://github.com/wajeht/bang/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wajeht/bang/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open Source Love svg1](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/wajeht/bang)

DuckDuckGo's !Bangs, but on steroids.

## 📖 Usage

### 🔍 Setup Custom Search Engine in Your Browser

Before you can use the Bang command from your browser's search bar, you need to add the Bang URL as a custom search engine. Follow these steps:

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

### 🎯 Default Commands

- `@a`, `@actions` - Quick access to your actions
- `@b`, `@bookmarks` - View your bookmarks
- `@s`, `@settings` - Access settings
- `@n`, `@notes` - Access notes

### 🎨 Special Commands

- `!bm [url]` - Add a bookmark
- `!bm [title] [url]` - Add a bookmark
  - `[title]` is optional, if not provided, we will auto fetch the title
  - `[url]` is required
  - eg: `!bm this title can be super long https://bang.jaw.dev`
- `!add [trigger] [url]` - Create a custom bang
  - `[trigger]` is required
  - `[url]` is required
  - eg: `!add jaw https://bang.jaw.dev`
- `!note [title] | [content]` - Create a note
  - `[title]` is optional, if not provided, we will auto fetch the title
  - `[content]` is required
  - eg: `!note some title | this is a note https://bang.jaw.dev`

### 🔖 How to Add Bookmarklet

To add the Bang bookmarklet to your browser, follow these steps:

1. Create a new bookmark in your browser.
2. For the bookmark's name, you can use something like "Bang Bookmarklet".
3. In the URL field, copy and paste the following code:
   ```javascript
   javascript: (function () {
   	const link = encodeURIComponent(window.location.href).trim();
   	if (!link) return;
   	window.location.href = `http://bang.jaw.dev/?q=!bm ${link}`;
   })();
   ```
4. Save the bookmark.

Now, whenever you want to add a bookmark using Bang, simply click on this bookmarklet.

### 🔖 Browser Bookmarklet

#### 🔖 Bookmark

```javascript
javascript: (function () {
	const link = encodeURIComponent(window.location.href).trim();
	if (!link) return;
	window.location.href = `http://bang.jaw.dev/?q=!bm ${link}`;
})();
```

#### ⚡️ Action

```javascript
javascript: (function () {
	const trigger = prompt('please enter a trigger').trim();
	if (!trigger) return;
	const link = encodeURIComponent(window.location.href).trim();
	if (!link) return;
	window.location.href = `http://bang.jaw.dev/?q=!add !${trigger} ${link}`;
})();
```

## 📑 Docs

- See [ROADMAP](./docs/roadmap.md) for `roadmap` guide.
- See [DEVELOPMENT](./docs/development.md) for `development` guide.
- See [CONTRIBUTION](./docs/contribution.md) for `contribution` guide.

## 📜 License

Distributed under the MIT License © [wajeht](https://github.com/wajeht). See [LICENSE](./LICENSE) for more information.
