# 🔧 Command Architecture for Bangs System

This document outlines the command structure and usage patterns for the Bangs system. Each command supports natural input with flexible parsing for URLs, dates, and content.

---

## 🛠️ 1. Actions (`!a`)

Create custom triggers (bangs) that redirect to specific URLs.

### Syntax
```
!a <trigger> <url>
```

### Examples
```
!a !rr https://bangs.jaw.dev
!a !rr bangs.jaw.dev
!a !rr http://bangs.jaw.dev
!a !rr www.bangs.jaw.dev
```

---

## 🔖 2. Bookmarks (`!bm`)

Save URLs for quick access.

### Quick Bookmark

#### Syntax
```
!bm <url>
```

#### Examples
```
!bm https://bangs.jaw.dev
!bm bangs.jaw.dev
!bm http://bangs.jaw.dev
!bm www.bangs.jaw.dev
```

### Bookmark with Title

#### Syntax
```
!bm <title> <url>
```

#### Examples
```
!bm Richard Hendricks https://bangs.jaw.dev
!bm Richard Hendricks bangs.jaw.dev
!bm Richard Hendricks http://bangs.jaw.dev
!bm Richard Hendricks www.bangs.jaw.dev
```

---

## 📝 3. Notes (`!n`)

Capture quick notes.

### Quick Note

#### Syntax
```
!n <content>
```

#### Example
```
!n I'm going to the gym
```

### Note with Title

#### Syntax
```
!n <title> | <content>
```

#### Examples
```
!n Gym | I'm going to the gym
!n Gym | I'm going to the gym at 5pm
```

---

## ⏰ 4. Reminders (`!r`)

Create personal reminders with or without time.

### Quick Reminder

#### Syntax
```
!r <description>
```

#### Example
```
!r I'm going to the gym
```

### Reminder with Timing

#### Syntax
```
!r <when> | <description>
```

#### Examples
```
!r 2025-07-26 | I'm going to the gym
!r daily | I'm going to the gym
!r weekly | I'm going to the gym
!r monthly | I'm going to the gym
```

### Detailed Reminder with Title

#### Syntax
```
!r <when> | <title> | <content>
```

#### Examples
```
!r 2025-07-26 | Gym | Go to the gym at 5pm
!r tomorrow | Meeting | https://zoom.us/meeting123
!r weekly | Review | Check weekly metrics
```

---

## 🔍 5. Search

Search across all data types.

### Search Everything
```
!s <query>
```

### Search Bookmarks
```
!sbm <query>
```

### Search Notes
```
!sn <query>
```

### Search Actions
```
!sa <query>
```

### Search Bangs
```
!sb <query>
```

### Search Tabs
```
!st <query>
```

#### Example
```
!sbm bangs
```

---

## 🧩 6. Management

### Edit Action Trigger

#### Syntax
```
!e <old_trigger> <new_trigger>
```

#### Example
```
!e !rr !rh
```

### Edit Action URL

#### Syntax
```
!e <trigger> <new_url>
```

#### Example
```
!e !rr https://newurl.com
```

### Delete Action

#### Syntax
```
!d <trigger>
```

#### Example
```
!d !rr
```

---

## 🧭 7. Navigation

### Go to Sections
```
@bm    → Bookmarks
@n     → Notes
@r     → Reminders
@a     → Actions
@b     → Bangs
@t     → Tabs
@s     → Settings
```

### Filtered Views
```
@bm <query> → Search bookmarks
@n <query>  → Search notes
@a <query>  → Search actions
```

#### Examples
```
@bm youtube
@n gym
@a rr
```
