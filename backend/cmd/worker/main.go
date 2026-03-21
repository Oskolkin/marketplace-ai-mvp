package main

import (
	"log"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/config"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/jobs"
	appLogger "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/logger"
	"go.uber.org/zap"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	logger, err := appLogger.New(cfg.AppEnv)
	if err != nil {
		log.Fatal(err)
	}
	defer logger.Sync()

	logger.Info("worker config loaded")

	redisCfg := jobs.RedisConfig{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	}

	server := jobs.NewAsynqServer(redisCfg)
	handler := jobs.NewHandler(logger)
	mux := jobs.NewServeMux(handler)

	logger.Info("starting worker")

	if err := server.Run(mux); err != nil {
		logger.Fatal("worker failed", zap.Error(err))
	}
}
