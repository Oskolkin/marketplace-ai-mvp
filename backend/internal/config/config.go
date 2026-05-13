package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	App       AppConfig
	Server    ServerConfig
	DB        DBConfig
	Redis     RedisConfig
	S3        S3Config
	Auth      AuthConfig
	Admin     AdminConfig
	Sentry    SentryConfig
	Telemetry TelemetryConfig
	OpenAI    OpenAIConfig
	AI        AIContextLimitsConfig
	Cleanup   CleanupConfig
}

type AppConfig struct {
	Env string
}

type ServerConfig struct {
	Port              string
	WorkerMetricsPort string
}

type DBConfig struct {
	URL            string
	MigrationsPath string
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type S3Config struct {
	Endpoint        string
	AccessKey       string
	SecretKey       string
	BucketRaw       string
	BucketExports   string
	BucketArtifacts string
	UseSSL          bool
}

type AuthConfig struct {
	JWTSecret       string
	EncryptionKey   string
	CookieName      string
	SessionTTLHours int
}

type AdminConfig struct {
	Emails []string
}

type SentryConfig struct {
	DSN     string
	Release string
}

type TelemetryConfig struct {
	Enabled      bool
	OTLPEndpoint string
	ServiceName  string
}

type OpenAIConfig struct {
	APIKey         string
	Model          string
	TimeoutSeconds int
	MaxRetries     int
}

// AIContextLimitsConfig caps AI payloads before OpenAI (MVP byte/token heuristics).
type AIContextLimitsConfig struct {
	RecommendationMaxContextItems int
	RecommendationMaxContextBytes int
	ChatMaxContextItems           int
	ChatMaxContextBytes           int
	MaxInputTokensApprox          int
	MaxOutputTokens               int
}

// CleanupConfig controls optional background maintenance (MVP: archive stale chat sessions only).
type CleanupConfig struct {
	Enabled         bool
	RetentionDays   int
	Schedule        time.Duration
}

func Load() (*Config, error) {
	cfg := &Config{
		App: AppConfig{
			Env: getEnv("APP_ENV", ""),
		},
		Server: ServerConfig{
			Port:              getEnv("BACKEND_PORT", "8080"),
			WorkerMetricsPort: getEnv("WORKER_METRICS_PORT", "9091"),
		},
		DB: DBConfig{
			URL:            getEnv("DATABASE_URL", ""),
			MigrationsPath: getEnv("MIGRATIONS_PATH", "./migrations"),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", ""),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvAsInt("REDIS_DB", 0),
		},
		S3: S3Config{
			Endpoint:        getEnv("S3_ENDPOINT", ""),
			AccessKey:       getEnv("S3_ACCESS_KEY", ""),
			SecretKey:       getEnv("S3_SECRET_KEY", ""),
			BucketRaw:       getEnv("S3_BUCKET_RAW", ""),
			BucketExports:   getEnv("S3_BUCKET_EXPORTS", ""),
			BucketArtifacts: getEnv("S3_BUCKET_ARTIFACTS", ""),
			UseSSL:          getEnvAsBool("S3_USE_SSL", false),
		},
		Auth: AuthConfig{
			JWTSecret:       getEnv("JWT_SECRET", ""),
			EncryptionKey:   getEnv("ENCRYPTION_KEY", ""),
			CookieName:      getEnv("AUTH_COOKIE_NAME", "session_token"),
			SessionTTLHours: getEnvAsInt("AUTH_SESSION_TTL_HOURS", 168),
		},
		Admin: AdminConfig{
			Emails: NormalizeAdminEmails(getEnv("ADMIN_EMAILS", "")),
		},
		Sentry: SentryConfig{
			DSN:     getEnv("SENTRY_DSN", ""),
			Release: getEnv("SENTRY_RELEASE", "dev"),
		},
		Telemetry: TelemetryConfig{
			Enabled:      getEnvAsBool("OTEL_ENABLED", false),
			OTLPEndpoint: getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
			ServiceName:  getEnv("OTEL_SERVICE_NAME", "marketplace-ai-backend"),
		},
		OpenAI: OpenAIConfig{
			APIKey:         getEnv("OPENAI_API_KEY", ""),
			Model:          getEnv("OPENAI_MODEL", "gpt-4.1-mini"),
			TimeoutSeconds: getEnvAsInt("OPENAI_TIMEOUT_SECONDS", 30),
			MaxRetries:     getEnvAsInt("OPENAI_MAX_RETRIES", 2),
		},
		AI: AIContextLimitsConfig{
			RecommendationMaxContextItems: getEnvAsInt("AI_RECOMMENDATION_MAX_CONTEXT_ITEMS", 50),
			RecommendationMaxContextBytes: getEnvAsInt("AI_RECOMMENDATION_MAX_CONTEXT_BYTES", 480*1024),
			ChatMaxContextItems:             getEnvAsInt("AI_CHAT_MAX_CONTEXT_ITEMS", 20),
			ChatMaxContextBytes:             getEnvAsInt("AI_CHAT_MAX_CONTEXT_BYTES", 50*1024),
			MaxInputTokensApprox:            getEnvAsInt("AI_MAX_INPUT_TOKENS_APPROX", 120000),
			MaxOutputTokens:                 getEnvAsInt("AI_MAX_OUTPUT_TOKENS", 4096),
		},
		Cleanup: CleanupConfig{
			Enabled:       getEnvAsBool("CLEANUP_ENABLED", false),
			RetentionDays: getEnvAsInt("CLEANUP_RETENTION_DAYS", 90),
			Schedule:      getEnvAsDuration("CLEANUP_SCHEDULE", 168*time.Hour),
		},
	}

	if err := validate(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

func validate(cfg *Config) error {

	if cfg.Auth.CookieName == "" {
		return fmt.Errorf("AUTH_COOKIE_NAME is required")
	}
	if cfg.Auth.SessionTTLHours <= 0 {
		return fmt.Errorf("AUTH_SESSION_TTL_HOURS must be greater than 0")
	}
	if cfg.Server.WorkerMetricsPort == "" {
		return fmt.Errorf("WORKER_METRICS_PORT is required")
	}
	if cfg.App.Env == "" {
		return fmt.Errorf("APP_ENV is required")
	}
	if cfg.Server.Port == "" {
		return fmt.Errorf("BACKEND_PORT is required")
	}
	if cfg.DB.URL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.DB.MigrationsPath == "" {
		return fmt.Errorf("MIGRATIONS_PATH is required")
	}
	if cfg.Redis.Addr == "" {
		return fmt.Errorf("REDIS_ADDR is required")
	}
	if cfg.S3.Endpoint == "" {
		return fmt.Errorf("S3_ENDPOINT is required")
	}
	if cfg.S3.AccessKey == "" {
		return fmt.Errorf("S3_ACCESS_KEY is required")
	}
	if cfg.S3.SecretKey == "" {
		return fmt.Errorf("S3_SECRET_KEY is required")
	}
	if cfg.S3.BucketRaw == "" {
		return fmt.Errorf("S3_BUCKET_RAW is required")
	}
	if cfg.S3.BucketExports == "" {
		return fmt.Errorf("S3_BUCKET_EXPORTS is required")
	}
	if cfg.S3.BucketArtifacts == "" {
		return fmt.Errorf("S3_BUCKET_ARTIFACTS is required")
	}
	if cfg.OpenAI.Model == "" {
		return fmt.Errorf("OPENAI_MODEL is required")
	}
	if cfg.OpenAI.TimeoutSeconds <= 0 {
		return fmt.Errorf("OPENAI_TIMEOUT_SECONDS must be greater than 0")
	}
	if cfg.OpenAI.MaxRetries < 0 {
		return fmt.Errorf("OPENAI_MAX_RETRIES must be greater than or equal to 0")
	}
	if cfg.Cleanup.Enabled && cfg.Cleanup.RetentionDays <= 0 {
		return fmt.Errorf("CLEANUP_RETENTION_DAYS must be greater than 0 when CLEANUP_ENABLED is true")
	}
	if cfg.Cleanup.Enabled && cfg.Cleanup.Schedule <= 0 {
		return fmt.Errorf("CLEANUP_SCHEDULE must be a positive duration when CLEANUP_ENABLED is true")
	}

	switch cfg.App.Env {
	case "local", "test", "staging", "production":
	default:
		return fmt.Errorf("APP_ENV must be one of: local, test, staging, production")
	}

	return nil
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func getEnvAsInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvAsBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}

	parsed, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvAsDuration(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func NormalizeAdminEmails(raw string) []string {
	if raw == "" {
		return []string{}
	}

	parts := strings.Split(raw, ",")
	emails := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))

	for _, part := range parts {
		email := strings.ToLower(strings.TrimSpace(part))
		if email == "" {
			continue
		}
		if _, ok := seen[email]; ok {
			continue
		}
		seen[email] = struct{}{}
		emails = append(emails, email)
	}

	return emails
}
