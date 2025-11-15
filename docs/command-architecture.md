# ⚡️ Command Architecture

**Command your web from the address bar**

This document outlines the new command structure and usage patterns for Command. The architecture treats your browser's address bar like a CLI interface with three distinct command types.

---

## 🎯 Command Philosophy

Command uses three symbols for three distinct purposes:

| Symbol | Purpose              | Mental Model               | Read/Write     |
| ------ | -------------------- | -------------------------- | -------------- |
| `!`    | Searches & Redirects | "I want to GO somewhere"   | Read-only      |
| `/`    | Actions & Operations | "I want to DO something"   | Write/Modify   |
| `@`    | System Navigation    | "I want to VIEW a section" | Internal Pages |

---

## 🔍 1. Searches & Redirects (`!`)

Use `!` to **search or navigate** to external websites. These are read-only operations that redirect you somewhere.

### System Bangs

Built-in shortcuts to popular services:

```
!g python                  → Google search for "python"
!gh wajeht/bang            → GitHub repository
!hn                        → Hacker News homepage
!hn javascript             → Search Hacker News
!tw elonmusk               → Twitter profile
!yt cat videos             → YouTube search
!w javascript              → Wikipedia search
!r webdev                  → Reddit r/webdev
!amz laptop                → Amazon search
```

### Custom Bangs

Create your own shortcuts (after using `/add`):

```
!work                      → Your work dashboard
!docs                      → Your documentation site
!jira PROJ-123             → Your Jira ticket
!figma                     → Your Figma designs
```

### Usage Examples

```
!g javascript closures     → Search Google
!gh                        → GitHub homepage
!gh torvalds/linux         → Specific repository
!yt                        → YouTube homepage
!yt how to cook pasta      → YouTube search
```

### Bang-only Queries

Typing just the bang without search terms redirects to the service homepage:

```
!g                         → https://google.com
!gh                        → https://github.com
!tw                        → https://twitter.com
```

---

## ⚙️ 2. Actions & Operations (`/`)

Use `/` to **create, modify, or manage** your data. These operations change state.

### 📑 Create Bookmark

Save URLs for quick access.

```
/bm <url>
/bm <title> <url>
/bm --hide <url>                    Hidden bookmark (requires password)
/bm --hide <title> <url>
```

**Examples:**

```
/bm https://example.com
/bm My Favorite Site https://example.com
/bm example.com                     Domain-only (auto-adds https://)
/bm --hide https://private.com      Hidden bookmark
```

---

### 🎯 Create Custom Bang

Create your own shortcuts and search engines.

```
/add <trigger> <url>
/add --hide <trigger> <url>         Hidden action (requires password)
```

**Examples:**

```
/add work https://work.example.com
/add !jira https://jira.com/browse/{{{s}}}
/add gh https://github.com          Add without ! prefix
/add !gh https://github.com         Add with ! prefix
```

**Note:** The `{{{s}}}` placeholder will be replaced with your search term when using the bang.

---

### 📝 Create Note

Capture quick notes and ideas.

```
/note <content>
/note <title> | <content>
/note --hide <content>              Hidden note (requires password)
/note --hide <title> | <content>
```

**Examples:**

```
/note Buy milk and eggs
/note Shopping List | Buy milk, eggs, bread
/note Project Ideas | Build a CLI tool for bookmarks
/note --hide Passwords | bank: 1234, email: 5678
```

---

### ⏰ Create Reminder

Set up one-time or recurring reminders.

```
/remind <description>
/remind <when> <description>
/remind <when> | <description> | <content>
```

**Timing Keywords:**

- `daily` - Every day
- `weekly` - Every Saturday
- `monthly` - First of each month
- `YYYY-MM-DD` - Specific date

**Examples:**

```
/remind Take out trash
/remind daily Water the plants
/remind weekly Review metrics
/remind monthly Pay bills
/remind 2025-12-25 Christmas party
/remind daily | Morning routine | Meditate and exercise
/remind weekly Check https://example.com/updates
```

---

### ✏️ Edit Custom Bang

Modify existing custom bangs.

```
/edit <trigger> <new-trigger>       Change trigger only
/edit <trigger> <url>               Change URL only
/edit <trigger> <new-trigger> <url> Change both
```

**Examples:**

```
/edit !old !new                     Rename trigger
/edit !work https://new-work.com    Update URL
/edit !gh !github https://github.com Change both
```

---

### 🗑️ Delete

Remove custom bangs or tabs.

```
/del <trigger>
```

**Examples:**

```
/del !custom
/del !old-bang
/del custom                         Works with or without !
```

---

### 🔍 Global Search

Search across all your data (bookmarks, notes, actions, tabs, reminders).

```
/find <query>
```

**Examples:**

```
/find javascript
/find react hooks
/find api documentation
```

---

### 📌 Organization (Future)

Coming soon:

```
/pin <id>                           Pin item to top
/unpin <id>                         Unpin item
/archive <type>                     Archive old items
/cleanup duplicates                 Remove duplicate bookmarks
```

---

### 📊 System Operations (Future)

Coming soon:

```
/stats                              Usage statistics
/export bookmarks                   Export data
/import bookmarks.json              Import data
/backup                             Backup everything
/monitor <url>                      Watch URL for changes
```

---

## 🧭 3. System Navigation (`@`)

Use `@` to **navigate to internal pages** within Command.

### Quick Navigation

```
@b, @bangs                 → /bangs
@bm, @bookmarks            → /bookmarks
@a, @actions               → /actions
@t, @tabs                  → /tabs
@n, @notes                 → /notes
@r, @reminders             → /reminders
@s, @settings              → /settings
@admin                     → /admin
@api                       → /api-docs
@data                      → /settings/data
```

### Navigation with Search

Filter results by adding a search term after the command:

```
@notes javascript          → /notes?search=javascript
@bookmarks react           → /bookmarks?search=react
@actions custom            → /actions?search=custom
@tabs work                 → /tabs?search=work
@reminders daily           → /reminders?search=daily
```

**Examples:**

```
@n                         Go to notes page
@n project ideas           Search notes for "project ideas"
@bm                        Go to bookmarks page
@bm react                  Search bookmarks for "react"
```

---

## 📋 Quick Reference

### Searches & Redirects (`!`)

```
!g <query>                 Google search
!gh <repo>                 GitHub
!hn <query>                Hacker News
!<custom> <query>          Your custom bangs
```

### Actions (`/`)

```
/bm <url>                  Create bookmark
/add <trigger> <url>       Create custom bang
/note <content>            Create note
/remind <when> <desc>      Create reminder
/edit <trigger> <new>      Edit custom bang
/del <trigger>             Delete custom bang
/find <query>              Global search
```

### Navigation (`@`)

```
@notes                     Go to notes
@bookmarks                 Go to bookmarks
@actions                   Go to actions
@tabs                      Go to tabs
@reminders                 Go to reminders
@settings                  Go to settings
@<section> <query>         Navigate with filter
```

---

## 🎨 Special Features

### Hidden Items

Protect sensitive items with a password:

```
/bm --hide https://private.com
/add --hide secret https://secret.com
/note --hide Sensitive | content
```

**Requirements:**

- Must set a global password in settings first
- Password required to view hidden items
- Only redirect-type actions can be hidden

### Pipe Separator

Use `|` to separate title from content in notes and reminders:

```
/note Title | Content
/remind daily | Task | Details
```

### URL Detection

Command automatically detects URLs in multiple formats:

```
https://example.com        Full URL with protocol
http://example.com         HTTP protocol
example.com                Domain only (auto-adds https://)
www.example.com            WWW prefix
```

### Default Search

If no command matches, Command falls back to your default search provider:

```
random search query        → DuckDuckGo (default)
```

You can change your default search provider in settings to:

- DuckDuckGo
- Google
- Bing
- Yahoo

---

## 🚀 Usage Tips

1. **Start typing `/` to see available actions**
2. **Use `@` for quick navigation between sections**
3. **Create custom bangs with `/add` for frequently visited sites**
4. **Use `--hide` flag for sensitive bookmarks and notes**
5. **Pipe separator `|` helps organize notes and reminders**
6. **Tab completion works with all commands**
7. **Unknown `!` commands search DuckDuckGo (or your default)**

---

## 🔒 Security

- Hidden items require password authentication
- Password set once in settings
- Session-based authentication (expires after inactivity)
- CSRF protection on all actions
- Rate limiting for anonymous users

---

## 📝 Examples by Use Case

### Quick Bookmark from Address Bar

```
/bm https://interesting-article.com
```

### Create Work Shortcut

```
/add work https://company.slack.com
```

Then use:

```
!work                      Opens Slack
```

### Quick Note

```
/note Call dentist tomorrow
```

### Daily Reminder

```
/remind daily Stand-up meeting at 9am
```

### Search Your Notes

```
@notes meeting             Search notes for "meeting"
```

### Navigate to Bookmarks

```
@bm                        View all bookmarks
@bm react                  Filter by "react"
```

---

## 🆚 Command Comparison

### Old Way (Mixed)

```
!bm https://example.com    Action disguised as bang
!g python                  Search (actual bang)
```

**Confusing:** Is `!` for searching or doing?

### New Way (Clean)

```
/bm https://example.com    Clearly an action
!g python                  Clearly a search/redirect
@bookmarks                 Clearly navigation
```

**Clear:** Each symbol has one purpose

---

## 🎯 Mental Model

Think of Command like a CLI:

```bash
# Navigation (cd)
@notes                     # Like: cd /notes

# Actions (commands)
/add work https://...      # Like: create work-shortcut
/bm https://...            # Like: bookmark add

# Shortcuts (aliases)
!g python                  # Like: google-search python
!work                      # Like: open work-dashboard
```

---

## 📚 Further Reading

- [Current Search Architecture](./search-architecture.md) - Current implementation
- [Development Guide](./development.md)
- [Contribution Guide](./contribution.md)
- [Recipe Guide](./recipe.md)
