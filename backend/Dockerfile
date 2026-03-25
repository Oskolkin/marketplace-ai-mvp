FROM golang:1.25-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /bin/api ./cmd/api
RUN go build -o /bin/worker ./cmd/worker

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /bin/api /app/api
COPY --from=builder /bin/worker /app/worker
COPY migrations /app/migrations

EXPOSE 8081
CMD ["/app/api"]