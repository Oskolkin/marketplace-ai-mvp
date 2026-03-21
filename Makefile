.PHONY: infra-up infra-down infra-logs

infra-up:
	docker compose up -d

infra-down:
	docker compose down

infra-logs:
	docker compose logs -f