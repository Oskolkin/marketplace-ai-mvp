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

.PHONY: migrate-up migrate-down migrate-force migrate-create

MIGRATIONS_DIR=backend/migrations
DATABASE_URL=postgres://postgres:postgres@localhost:55432/marketplace_ai?sslmode=disable

migrate-up:
	migrate -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" up

migrate-down:
	migrate -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" down 1

migrate-force:
	migrate -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" force $(version)

migrate-create:
	migrate create -ext sql -dir $(MIGRATIONS_DIR) -seq $(name)

.PHONY: dev-db-reset dev-db-check-initial-sync

dev-db-reset:
	psql "$(DATABASE_URL)" -f scripts/dev/sql/reset_dev_data.sql

dev-db-check-initial-sync:
	psql "$(DATABASE_URL)" -f scripts/dev/sql/check_initial_sync.sql

.PHONY: dev-seed-stage3

dev-seed-stage3:
	cd backend && go run ./cmd/dev-seed-stage3 --seller-account-id $(seller_account_id)

.PHONY: dev-rebuild-account-metrics

dev-rebuild-account-metrics:
	cd backend && go run ./cmd/dev-rebuild-account-metrics --seller-account-id $(seller_account_id)

.PHONY: dev-rebuild-sku-metrics

dev-rebuild-sku-metrics:
	cd backend && go run ./cmd/dev-rebuild-sku-metrics --seller-account-id $(seller_account_id)

.PHONY: dev-check-stock-metrics

dev-check-stock-metrics:
	cd backend && go run ./cmd/dev-check-stock-metrics --seller-account-id $(seller_account_id)

.PHONY: dev-check-dashboard-metrics

dev-check-dashboard-metrics:
	cd backend && go run ./cmd/dev-check-dashboard-metrics --seller-account-id $(seller_account_id)