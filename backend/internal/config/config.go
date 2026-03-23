package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	AppEnv         string
	BackendPort    string
	DatabaseURL    string
	MigrationsPath string

	RedisAddr     string
	RedisPassword string
	RedisDB       int

	S3Endpoint        string
	S3AccessKey       string
	S3SecretKey       string
	S3BucketRaw       string
	S3BucketExports   string
	S3BucketArtifacts string
	S3UseSSL          bool
}

func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:         getEnv("APP_ENV", "local"),
		BackendPort:    getEnv("BACKEND_PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", ""),
		MigrationsPath: getEnv("MIGRATIONS_PATH", "./migrations"),

		RedisAddr:     getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getEnvAsInt("REDIS_DB", 0),

		S3Endpoint:        getEnv("S3_ENDPOINT", ""),
		S3AccessKey:       getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey:       getEnv("S3_SECRET_KEY", ""),
		S3BucketRaw:       getEnv("S3_BUCKET_RAW", "raw-payloads"),
		S3BucketExports:   getEnv("S3_BUCKET_EXPORTS", "exports"),
		S3BucketArtifacts: getEnv("S3_BUCKET_ARTIFACTS", "artifacts"),
		S3UseSSL:          getEnvAsBool("S3_USE_SSL", false),
	}

	if cfg.BackendPort == "" {
		return nil, fmt.Errorf("BACKEND_PORT is required")
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.MigrationsPath == "" {
		return nil, fmt.Errorf("MIGRATIONS_PATH is required")
	}
	if cfg.RedisAddr == "" {
		return nil, fmt.Errorf("REDIS_ADDR is required")
	}
	if cfg.S3Endpoint == "" {
		return nil, fmt.Errorf("S3_ENDPOINT is required")
	}
	if cfg.S3AccessKey == "" {
		return nil, fmt.Errorf("S3_ACCESS_KEY is required")
	}
	if cfg.S3SecretKey == "" {
		return nil, fmt.Errorf("S3_SECRET_KEY is required")
	}

	return cfg, nil
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
