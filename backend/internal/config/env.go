package config

import "github.com/joho/godotenv"

func LoadEnvFiles() error {
	_ = godotenv.Load(".env.local")
	return nil
}
