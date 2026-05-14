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

.PHONY: dev-check-critical-skus

dev-check-critical-skus:
	cd backend && go run ./cmd/dev-check-critical-skus --seller-account-id $(seller_account_id)

.PHONY: dev-check-replenishment

dev-check-replenishment:
	cd backend && go run ./cmd/dev-check-replenishment --seller-account-id $(seller_account_id)

.PHONY: dev-check-dashboard-metrics

dev-check-dashboard-metrics:
	cd backend && go run ./cmd/dev-check-dashboard-metrics --seller-account-id $(seller_account_id)

.PHONY: dev-ingest-advertising

dev-ingest-advertising:
	cd backend && go run ./cmd/dev-ingest-advertising --seller-account-id $(seller_account_id)

# --- dev-seed-mvp (pre-billing MVP functional test) ---
.PHONY: seed-mvp seed-mvp-reset seed-mvp-validate seed-mvp-validate-alerts seed-mvp-validate-alerts-reset seed-mvp-validate-recommendations seed-mvp-validate-derived seed-mvp-existing

SEED_EMAIL        ?= demo@example.com
SEED_PASSWORD     ?= password123
SEED_ADMIN_EMAIL  ?= admin@example.com
SEED_SELLER_NAME  ?= Demo Ozon Seller
SEED_ANCHOR_DATE  ?= today
SEED_PRODUCTS     ?= 80
SEED_DAYS         ?= 90
SEED_BASE         ?= 20260514
SEED_RESET_PASSWORD ?= true

# Default seller for seed-mvp-validate (override if your seeded seller id differs).
VALIDATE_SELLER_ACCOUNT_ID ?= 1

SEED_COMMON = --email $(SEED_EMAIL) --password $(SEED_PASSWORD) \
	--admin-email $(SEED_ADMIN_EMAIL) --seller-name "$(SEED_SELLER_NAME)" \
	--anchor-date $(SEED_ANCHOR_DATE) --products $(SEED_PRODUCTS) --days $(SEED_DAYS) \
	--seed $(SEED_BASE) --reset-password=$(SEED_RESET_PASSWORD)

# Full seed for a new demo seller (wipes MVP-shaped rows for that seller when --reset=true).
seed-mvp seed-mvp-reset:
	cd backend && go run ./cmd/dev-seed-mvp $(SEED_COMMON) --reset=true

seed-mvp-validate:
	cd backend && go run ./cmd/dev-seed-mvp $(SEED_COMMON) --seller-account-id=$(VALIDATE_SELLER_ACCOUNT_ID) --validate-only

# Runs production Alerts Engine (same as POST /api/v1/alerts/run); requires prior seed + metrics rebuild.
seed-mvp-validate-alerts:
	cd backend && go run ./cmd/dev-seed-mvp $(SEED_COMMON) --seller-account-id=$(VALIDATE_SELLER_ACCOUNT_ID) --validate-alert-generation

seed-mvp-validate-alerts-reset:
	cd backend && go run ./cmd/dev-seed-mvp $(SEED_COMMON) --seller-account-id=$(VALIDATE_SELLER_ACCOUNT_ID) --validate-alert-generation --reset-derived=true

# Requires OPENAI_API_KEY and existing open alerts (e.g. run seed-mvp-validate-alerts first).
seed-mvp-validate-recommendations:
	cd backend && go run ./cmd/dev-seed-mvp $(SEED_COMMON) --seller-account-id=$(VALIDATE_SELLER_ACCOUNT_ID) --validate-recommendation-generation

# Read-only: expects manual Alerts / Recommendations / Chat / admin usage for this seller.
seed-mvp-validate-derived:
	cd backend && go run ./cmd/dev-seed-mvp $(SEED_COMMON) --seller-account-id=$(VALIDATE_SELLER_ACCOUNT_ID) --validate-derived

seed-mvp-existing:
	@test -n "$(SELLER_ACCOUNT_ID)" || (echo "Usage: make seed-mvp-existing SELLER_ACCOUNT_ID=1" && exit 1)
	cd backend && go run ./cmd/dev-seed-mvp $(SEED_COMMON) --seller-account-id=$(SELLER_ACCOUNT_ID) --reset=true