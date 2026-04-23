package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/account"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/analytics"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/auth"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/config"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/db"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/dbgen"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/health"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/httpserver"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/httpserver/handlers"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/ingestion"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/integrations/ozon"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/jobs"
	appLogger "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/logger"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/metrics"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/pricingconstraints"
	appRedis "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/redis"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/sentryx"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/storage"
	"github.com/getsentry/sentry-go"
	"github.com/prometheus/client_golang/prometheus"
	"go.uber.org/zap"
)

func main() {
	_ = config.LoadEnvFiles()

	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	if err := sentryx.Init(sentryx.Config{
		DSN:         cfg.Sentry.DSN,
		Environment: cfg.App.Env,
		Release:     cfg.Sentry.Release,
	}); err != nil {
		panic(err)
	}
	defer sentryx.Flush()

	log, err := appLogger.New(cfg.App.Env, "backend-api")
	if err != nil {
		panic(err)
	}
	defer log.Sync()

	registry := prometheus.NewRegistry()
	m := metrics.New(registry)
	m.AppInfo.WithLabelValues("backend-api", cfg.App.Env, "dev").Set(1)

	log.Info("config loaded",
		zap.String("port", cfg.Server.Port),
		zap.String("migrations_path", cfg.DB.MigrationsPath),
		zap.String("redis_addr", cfg.Redis.Addr),
		zap.String("s3_endpoint", cfg.S3.Endpoint),
		zap.String("auth_cookie_name", cfg.Auth.CookieName),
	)

	ctx := context.Background()

	postgres, err := db.New(ctx, cfg.DB.URL)
	if err != nil {
		m.DBUp.Set(0)
		sentry.CaptureException(err)
		log.Fatal("failed to connect to postgres", zap.Error(err))
	}
	defer postgres.Close()

	m.DBUp.Set(1)
	log.Info("db connected")

	if err := db.RunMigrations(postgres.SQLDB, cfg.DB.MigrationsPath); err != nil {
		sentry.CaptureException(err)
		log.Fatal("failed to run migrations", zap.Error(err))
	}
	log.Info("migrations ok")

	redisClient, err := appRedis.New(ctx, cfg.Redis.Addr, cfg.Redis.Password, cfg.Redis.DB)
	if err != nil {
		m.RedisUp.Set(0)
		sentry.CaptureException(err)
		log.Fatal("failed to connect to redis", zap.Error(err))
	}
	defer redisClient.Close()

	m.RedisUp.Set(1)
	log.Info("redis connected")

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
		m.S3Up.Set(0)
		sentry.CaptureException(err)
		log.Fatal("failed to connect to s3 storage", zap.Error(err))
	}

	m.S3Up.Set(1)
	log.Info("s3 connected")

	if err := storage.RunSmokeTest(ctx, s3Client); err != nil {
		sentry.CaptureException(err)
		log.Fatal("s3 smoke test failed", zap.Error(err))
	}
	log.Info("s3 smoke test ok")

	asynqClient := jobs.NewAsynqClient(jobs.RedisConfig{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	defer asynqClient.Close()

	task, err := jobs.NewSystemPingTask("hello from api startup")
	if err != nil {
		sentry.CaptureException(err)
		log.Fatal("failed to create demo task", zap.Error(err))
	}

	info, err := asynqClient.Enqueue(task)
	if err != nil {
		sentry.CaptureException(err)
		log.Fatal("failed to enqueue demo task", zap.Error(err))
	}

	log.Info("demo task enqueued",
		zap.String("task_id", info.ID),
		zap.String("queue", info.Queue),
		zap.String("type", task.Type()),
	)

	authService := auth.NewService(
		postgres.Pool,
		time.Duration(cfg.Auth.SessionTTLHours)*time.Hour,
	)
	authHandler := handlers.NewAuthHandler(authService, cfg.Auth.CookieName)
	authMiddleware := auth.Middleware(authService, cfg.Auth.CookieName)

	accountService := account.NewService(postgres.Pool)
	accountHandler := handlers.NewAccountHandler(accountService)
	dashboardService := analytics.NewDashboardService(postgres.Pool)
	stocksViewService := analytics.NewStocksViewService(postgres.Pool)
	criticalSKUService := analytics.NewCriticalSKUService(postgres.Pool)
	replenishmentService := analytics.NewReplenishmentService(postgres.Pool)
	advertisingService := analytics.NewAdvertisingService(postgres.Pool)
	pricingConstraintsService := pricingconstraints.NewService(dbgen.New(postgres.Pool))
	analyticsDashboardHandler := handlers.NewAnalyticsDashboardHandler(
		dashboardService,
		stocksViewService,
		criticalSKUService,
		replenishmentService,
		advertisingService,
	)
	pricingConstraintsHandler := handlers.NewPricingConstraintsHandler(pricingConstraintsService)

	ozonService, err := ozon.NewService(postgres.Pool, cfg.Auth.EncryptionKey)
	if err != nil {
		sentry.CaptureException(err)
		log.Fatal("failed to initialize ozon service", zap.Error(err))
	}
	ozonHandler := handlers.NewOzonHandler(ozonService)

	orchestrationService := ingestion.NewOrchestrationService(postgres.Pool, asynqClient)
	ozonIngestionSyncHandler := handlers.NewOzonIngestionSyncHandler(orchestrationService)

	statusService := ingestion.NewStatusService(postgres.Pool)
	ozonIngestionStatusHandler := handlers.NewOzonIngestionStatusHandler(statusService)

	readinessChecker := health.NewCompositeChecker(
		health.NewPostgresChecker(postgres.Pool),
		health.NewRedisChecker(redisClient.Raw),
	)
	healthHandler := health.NewHandler(readinessChecker)

	server := httpserver.New(
		cfg.Server.Port,
		healthHandler,
		authHandler,
		accountHandler,
		analyticsDashboardHandler,
		pricingConstraintsHandler,
		ozonHandler,
		ozonIngestionSyncHandler,
		ozonIngestionStatusHandler,
		authMiddleware,
		log,
		m,
		registry,
	)

	log.Info("starting backend",
		zap.String("port", cfg.Server.Port),
	)

	if err := server.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		sentry.CaptureException(err)
		log.Fatal("server failed to start", zap.Error(err))
	}
}
