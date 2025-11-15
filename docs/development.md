# 💻 Development

> [!NOTE]
> Nodejs version of this project is also available via `git checkout node` after pulling it down.

Clone the repository

```bash
$ git clone https://github.com/wajeht/command.git
```

Copy `.env.example` to `.env`

```bash
$ cp .env.example .env
```

Install dependencies

```bash
$ go mod download
```

Run development server

```bash
$ go run ./cmd
```

Test the application

```bash
$ go test ./...
```

