package logger

import "go.uber.org/zap"

func New(env string) (*zap.Logger, error) {
	if env == "local" {
		return zap.NewDevelopment()
	}
	return zap.NewProduction()
}
