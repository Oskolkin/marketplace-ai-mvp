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
