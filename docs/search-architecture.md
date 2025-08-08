# ⚡️ Command Architecture for Bangs System

This document outlines the command structure and usage patterns for the Bangs system. Each command supports natural input with flexible parsing for URLs, dates, and content.

---

## 🚀️ 1. Actions (`!a`)

Create custom triggers (bangs) that redirect to specific URLs.

### Syntax

#### Quick Action

```
!a <trigger> <url>
```

#### Examples

```
!a !test https://test.jaw.dev
!a !test test.jaw.dev
!a !test http://test.jaw.dev
!a !test www.test.jaw.dev
```

#### Action with Title

```
!a <trigger> <title> <url>
```

#### Examples

```
!a !test test https://test.jaw.dev
!a !test test test.jaw.dev
!a !test test http://test.jaw.dev
!a !test test www.test.jaw.dev
```

---

## ⭐️ 2. Bookmarks (`!bm`)

Save URLs for quick access.

### Quick Bookmark

#### Syntax

```
!bm <url>
```

#### Examples

```
!bm https://test.jaw.dev
!bm test.jaw.dev
!bm http://test.jaw.dev
!bm www.test.jaw.dev
```

### Bookmark with Title

#### Syntax

```
!bm <title> <url>
```

#### Examples

```
!bm hardcoded title https://test.jaw.dev
!bm hardcoded title test.jaw.dev
!bm hardcoded title http://test.jaw.dev
!bm hardcoded title www.test.jaw.dev
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
!r <title>
```

#### Example

```
!r I'm going to the gym
```

### Reminder with Timing

#### Syntax

```
!r <when> | <title>
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
!r Gym | Go to the gym at 5pm (will use default timing)
!r 2025-07-26 | Gym | Go to the gym at 5pm
!r 2025-07-26 Gym | Go to the gym at 5pm
!r tomorrow | Meeting https://zoom.us/meeting123
!r tomorrow Meeting https://zoom.us/meeting123 (notice no pipe operator when there is a URL)
!r weekly Review Check weekly metrics
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

### Search Users

```
!su <query>
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
@a     → Actions
@b     → Bangs
@bm    → Bookmarks
@t     → Tabs
@n     → Notes
@r     → Reminders
@u     → Users
```

### Filtered Views

```
@a <query>  → Search actions
@b <query>  → Search bangs
@bm <query> → Search bookmarks
@t <query>  → Search tabs
@n <query>  → Search notes
@u <query>  → Search users
```
