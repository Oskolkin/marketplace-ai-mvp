package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	App       AppConfig
	Server    ServerConfig
	DB        DBConfig
	Redis     RedisConfig
	S3        S3Config
	Auth      AuthConfig
	Sentry    SentryConfig
	Telemetry TelemetryConfig
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

type SentryConfig struct {
	DSN     string
	Release string
}

type TelemetryConfig struct {
	Enabled      bool
	OTLPEndpoint string
	ServiceName  string
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
		Sentry: SentryConfig{
			DSN:     getEnv("SENTRY_DSN", ""),
			Release: getEnv("SENTRY_RELEASE", "dev"),
		},
		Telemetry: TelemetryConfig{
			Enabled:      getEnvAsBool("OTEL_ENABLED", false),
			OTLPEndpoint: getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
			ServiceName:  getEnv("OTEL_SERVICE_NAME", "marketplace-ai-backend"),
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
