package config

import (
	"reflect"
	"testing"
)

func TestNormalizeAdminEmails(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want []string
	}{
		{
			name: "empty value",
			raw:  "",
			want: []string{},
		},
		{
			name: "single email",
			raw:  "admin@example.com",
			want: []string{"admin@example.com"},
		},
		{
			name: "multiple emails normalized and trimmed",
			raw:  "admin@example.com, Support@Example.com ",
			want: []string{"admin@example.com", "support@example.com"},
		},
		{
			name: "dedupe and ignore empty entries",
			raw:  "Admin@example.com, ,admin@example.com,support@example.com,",
			want: []string{"admin@example.com", "support@example.com"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeAdminEmails(tt.raw)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("NormalizeAdminEmails() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestLoadAdminEmailsFromEnv(t *testing.T) {
	setRequiredEnvForLoad(t)
	t.Setenv("ADMIN_EMAILS", "admin@example.com, Support@Example.com ,admin@example.com")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	want := []string{"admin@example.com", "support@example.com"}
	if !reflect.DeepEqual(cfg.Admin.Emails, want) {
		t.Fatalf("cfg.Admin.Emails = %#v, want %#v", cfg.Admin.Emails, want)
	}
}

func setRequiredEnvForLoad(t *testing.T) {
	t.Helper()

	t.Setenv("APP_ENV", "test")
	t.Setenv("BACKEND_PORT", "8081")
	t.Setenv("WORKER_METRICS_PORT", "9091")
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/db?sslmode=disable")
	t.Setenv("MIGRATIONS_PATH", "./migrations")
	t.Setenv("REDIS_ADDR", "localhost:6379")
	t.Setenv("S3_ENDPOINT", "localhost:19000")
	t.Setenv("S3_ACCESS_KEY", "minio")
	t.Setenv("S3_SECRET_KEY", "minio123")
	t.Setenv("S3_BUCKET_RAW", "raw-payloads")
	t.Setenv("S3_BUCKET_EXPORTS", "exports")
	t.Setenv("S3_BUCKET_ARTIFACTS", "artifacts")
	t.Setenv("AUTH_COOKIE_NAME", "session_token")
	t.Setenv("AUTH_SESSION_TTL_HOURS", "168")
	t.Setenv("OPENAI_MODEL", "gpt-4.1-mini")
	t.Setenv("OPENAI_TIMEOUT_SECONDS", "30")
	t.Setenv("OPENAI_MAX_RETRIES", "2")
}
