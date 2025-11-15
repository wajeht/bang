FROM golang:1.25-alpine AS build

WORKDIR /app

COPY . .

RUN go build -o command ./cmd

FROM alpine:latest

RUN apk --no-cache add ca-certificates curl

RUN addgroup -g 1001 -S command && adduser -S command -u 1001 -G command

WORKDIR /app

COPY --from=build /app/command ./command

USER command

EXPOSE 80

HEALTHCHECK CMD curl -f http://localhost/healthz || exit 1

CMD ["./command"]
