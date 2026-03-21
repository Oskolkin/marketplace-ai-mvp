package config

import (
	"fmt"
	"os"
)

type Config struct {
	AppEnv         string
	BackendPort    string
	DatabaseURL    string
	MigrationsPath string
}

func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:         getEnv("APP_ENV", "local"),
		BackendPort:    getEnv("BACKEND_PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", ""),
		MigrationsPath: getEnv("MIGRATIONS_PATH", "./migrations"),
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

	return cfg, nil
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}
