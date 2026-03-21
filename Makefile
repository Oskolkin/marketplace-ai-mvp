.PHONY: infra-up infra-down infra-logs

infra-up:
	docker compose up -d

infra-down:
	docker compose down

infra-logs:
	docker compose logs -f

backend-run:
	cd backend && go run ./cmd/api

backend-run-db:
	cd backend && set APP_ENV=local&& set BACKEND_PORT=8081&& set DATABASE_URL=postgres://postgres:postgres@localhost:55432/marketplace_ai?sslmode=disable&& set MIGRATIONS_PATH=./migrations&& go run ./cmd/api