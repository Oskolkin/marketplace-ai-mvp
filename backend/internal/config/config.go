package config

import (
	"fmt"
	"os"
)

type Config struct {
	AppEnv      string
	BackendPort string
}

func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:      getEnv("APP_ENV", "local"),
		BackendPort: getEnv("BACKEND_PORT", "8080"),
	}

	if cfg.BackendPort == "" {
		return nil, fmt.Errorf("BACKEND_PORT is required")
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
