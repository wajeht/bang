# ‼️ Bang

[![Node.js CI](https://github.com/wajeht/bang/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wajeht/bang/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/ISC) [![Open Source Love svg1](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/wajeht/bang)

DuckDuckGo's !Bangs, but on steroids.

# 📚 Technologies

- **Node** with **Express** for API
- **Vitest** for both API and UI testing
- **Postgres** because relational all the way
- **Zod** for types/validation
- **Prisma** for db cliinet
- **Tailwind** for rapid styling
- **DaisyUI** for some components
- **Vue** because this is a dashboard app
- and of course **Typescript** for everything ❤️

# 💻 Booklet

```javascript
javascript: (function () {
	const link = encodeURIComponent(window.location.href);
	window.location.href = 'http://localhost:3000/api/v1/bangs/search?q=!add ' + link;
})();
```

# © License

Distributed under the MIT license © wajeht. See LICENSE for more information.
