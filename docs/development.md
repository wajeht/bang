## 💻 Development

### Prerequisites

- Node.js `>=26.0.0`
- npm `>=11.0.0`

Clone the repository

```bash
$ git clone https://github.com/wajeht/bang.git
```

Copy `.env.example` to `.env` and update all the necessary environment variables.

```bash
$ cp .env.example .env
```

Install dependencies

```bash
$ npm install
```

This project's `.npmrc` sets `ignore-scripts=true` for supply-chain safety, which means
native dependencies such as `bcrypt` won't be built automatically. Rebuild them
explicitly:

```bash
$ npm run rebuild:native
```

`better-sqlite3` v13 ships N-API binaries in its package and should not be force-rebuilt.

Skipping this step will cause tests and the dev server to hang at module load.

Run development server

```bash
$ npm run dev
```

Run test

```bash
$ npm test
```

Format code

```bash
$ npm run format
```

Lint code

```bash
$ npm run lint
```

## 🐳 Docker

Copy `.env.example` to `.env` and update all the necessary environment variables.

```bash
$ cp .env.example .env
```

Run development server

```bash
$ docker compose -f docker-compose.dev.yml up

```

Run test

```bash
$ docker compose -f docker-compose.dev.yml exec bang npm run test

```

Format code

```bash
$ docker compose -f docker-compose.dev.yml exec bang npm run format
```

Lint code

```bash
$ docker compose -f docker-compose.dev.yml exec bang npm run lint
```
