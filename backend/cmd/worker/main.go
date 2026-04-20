package main

import (
	"context"
	"log"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/adsync"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/config"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/db"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/integrations/ozon"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/jobs"
	appLogger "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/logger"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/metrics"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/ordersync"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/productsync"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/rawpayloads"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/sentryx"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/stocksync"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/storage"
	"github.com/getsentry/sentry-go"
	"github.com/hibiken/asynq"
	"github.com/prometheus/client_golang/prometheus"
	"go.uber.org/zap"
)

func main() {
	_ = config.LoadEnvFiles()

	cfg, err := config.Load()
	if err != nil {
		sentry.CaptureException(err)
		log.Fatal(err)
	}

	if err := sentryx.Init(sentryx.Config{
		DSN:         cfg.Sentry.DSN,
		Environment: cfg.App.Env,
		Release:     cfg.Sentry.Release,
	}); err != nil {
		sentry.CaptureException(err)
		log.Fatal(err)
	}
	defer sentryx.Flush()

	logger, err := appLogger.New(cfg.App.Env, "backend-worker")
	if err != nil {
		sentry.CaptureException(err)
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
		zap.String("s3_endpoint", cfg.S3.Endpoint),
	)

	ctx := context.Background()

	postgres, err := db.New(ctx, cfg.DB.URL)
	if err != nil {
		sentry.CaptureException(err)
		logger.Fatal("failed to connect to postgres", zap.Error(err))
	}
	defer postgres.Close()

	logger.Info("worker postgres connected")

	s3Client, err := storage.New(ctx, storage.S3Config{
		Endpoint:        cfg.S3.Endpoint,
		AccessKey:       cfg.S3.AccessKey,
		SecretKey:       cfg.S3.SecretKey,
		UseSSL:          cfg.S3.UseSSL,
		BucketRaw:       cfg.S3.BucketRaw,
		BucketExports:   cfg.S3.BucketExports,
		BucketArtifacts: cfg.S3.BucketArtifacts,
	})
	if err != nil {
		sentry.CaptureException(err)
		logger.Fatal("failed to connect to s3 storage", zap.Error(err))
	}

	logger.Info("worker s3 connected")

	ozonService, err := ozon.NewService(postgres.Pool, cfg.Auth.EncryptionKey)
	if err != nil {
		sentry.CaptureException(err)
		logger.Fatal("failed to initialize ozon service", zap.Error(err))
	}

	rawPayloadService := rawpayloads.NewService(postgres.Pool, s3Client, cfg.S3.BucketRaw)
	productsImporter := productsync.NewService(postgres.Pool, ozonService, rawPayloadService)
	ordersImporter := ordersync.NewService(postgres.Pool, ozonService, rawPayloadService)
	stocksImporter := stocksync.NewService(postgres.Pool, ozonService, rawPayloadService)
	adsImporter := adsync.NewService()

	redisCfg := jobs.RedisConfig{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	}

	server := jobs.NewAsynqServer(redisCfg)
	handler := jobs.NewHandler(logger)
	asynqClient := jobs.NewAsynqClient(redisCfg)
	defer asynqClient.Close()

	ozonSyncCoordinatorHandler := jobs.NewOzonSyncCoordinatorHandler(postgres.Pool, asynqClient, logger)
	productsImportHandler := jobs.NewOzonImportHandler(postgres.Pool, logger, "products", productsImporter, ordersImporter, stocksImporter, adsImporter)
	ordersImportHandler := jobs.NewOzonImportHandler(postgres.Pool, logger, "orders", productsImporter, ordersImporter, stocksImporter, adsImporter)
	stocksImportHandler := jobs.NewOzonImportHandler(postgres.Pool, logger, "stocks", productsImporter, ordersImporter, stocksImporter, adsImporter)
	adsImportHandler := jobs.NewOzonImportHandler(postgres.Pool, logger, "ads", productsImporter, ordersImporter, stocksImporter, adsImporter)

	mux := jobs.NewServeMux(handler, logger, m)

	ozonInitialSyncHandler := jobs.NewOzonInitialSyncHandler(postgres.Pool, logger)

	mux.HandleFunc(jobs.TaskTypeOzonInitialSync, func(ctx context.Context, t *asynq.Task) error {
		return ozonInitialSyncHandler.Handle(ctx, t.Payload())
	})
	mux.HandleFunc(jobs.TaskTypeOzonSyncCoordinator, func(ctx context.Context, t *asynq.Task) error {
		return ozonSyncCoordinatorHandler.Handle(ctx, t.Payload())
	})
	mux.HandleFunc(jobs.TaskTypeOzonImportProducts, func(ctx context.Context, t *asynq.Task) error {
		return productsImportHandler.Handle(ctx, t.Payload())
	})
	mux.HandleFunc(jobs.TaskTypeOzonImportOrders, func(ctx context.Context, t *asynq.Task) error {
		return ordersImportHandler.Handle(ctx, t.Payload())
	})
	mux.HandleFunc(jobs.TaskTypeOzonImportStocks, func(ctx context.Context, t *asynq.Task) error {
		return stocksImportHandler.Handle(ctx, t.Payload())
	})
	mux.HandleFunc(jobs.TaskTypeOzonImportAds, func(ctx context.Context, t *asynq.Task) error {
		return adsImportHandler.Handle(ctx, t.Payload())
	})

	logger.Info("starting worker")

	if err := server.Run(mux); err != nil {
		sentry.CaptureException(err)
		logger.Fatal("worker failed", zap.Error(err))
	}
}
