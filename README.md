# ‼️ Bang

<!-- [![Node.js CI](https://github.com/wajeht/bang/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wajeht/bang/actions/workflows/ci.yml) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/ISC)
[![Open Source Love svg1](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/wajeht/bang)

DuckDuckGo's !Bangs, but on steroids.

> [!WARNING]
> This project is unfinished and heavily work in progress.

# 💻 Booklet

```javascript
javascript: (function () {
	const link = encodeURIComponent(window.location.href);
	window.location.href = 'http://localhost:3000/api/v1/bangs/search?q=!add ' + link;
})();
```

# © License

Distributed under the MIT license © wajeht. See LICENSE for more information.
