package main

import (
	"log"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/config"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/jobs"
	appLogger "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/logger"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/metrics"
	"github.com/prometheus/client_golang/prometheus"
	"go.uber.org/zap"
)

func main() {
	_ = config.LoadEnvFiles()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	logger, err := appLogger.New(cfg.App.Env, "backend-worker")
	if err != nil {
		log.Fatal(err)
	}
	defer logger.Sync()

	registry := prometheus.NewRegistry()
	m := metrics.New(registry)
	m.AppInfo.WithLabelValues("backend-worker", cfg.App.Env, "dev").Set(1)

	metrics.StartMetricsServer(cfg.Server.WorkerMetricsPort, registry, logger, "backend-worker")

	logger.Info("worker config loaded",
		zap.String("redis_addr", cfg.Redis.Addr),
		zap.String("worker_metrics_port", cfg.Server.WorkerMetricsPort),
	)

	redisCfg := jobs.RedisConfig{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	}

	server := jobs.NewAsynqServer(redisCfg)
	handler := jobs.NewHandler(logger)
	mux := jobs.NewServeMux(handler, logger, m)

	logger.Info("starting worker")

	if err := server.Run(mux); err != nil {
		logger.Fatal("worker failed", zap.Error(err))
	}
}
