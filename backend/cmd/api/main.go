package main

import (
	"context"
	"errors"
	"net/http"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/config"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/db"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/health"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/httpserver"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/jobs"
	appLogger "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/logger"
	appRedis "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/redis"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/storage"
	"go.uber.org/zap"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	log, err := appLogger.New(cfg.AppEnv)
	if err != nil {
		panic(err)
	}
	defer log.Sync()

	log.Info("config loaded",
		zap.String("env", cfg.AppEnv),
		zap.String("port", cfg.BackendPort),
		zap.String("migrations_path", cfg.MigrationsPath),
		zap.String("redis_addr", cfg.RedisAddr),
		zap.String("s3_endpoint", cfg.S3Endpoint),
	)

	ctx := context.Background()

	postgres, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal("failed to connect to postgres", zap.Error(err))
	}
	defer postgres.Close()

	log.Info("db connected")

	if err := db.RunMigrations(postgres.SQLDB, cfg.MigrationsPath); err != nil {
		log.Fatal("failed to run migrations", zap.Error(err))
	}

	log.Info("migrations ok")

	redisClient, err := appRedis.New(ctx, cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err != nil {
		log.Fatal("failed to connect to redis", zap.Error(err))
	}
	defer redisClient.Close()

	log.Info("redis connected")

	s3Client, err := storage.New(ctx, storage.S3Config{
		Endpoint:        cfg.S3Endpoint,
		AccessKey:       cfg.S3AccessKey,
		SecretKey:       cfg.S3SecretKey,
		UseSSL:          cfg.S3UseSSL,
		BucketRaw:       cfg.S3BucketRaw,
		BucketExports:   cfg.S3BucketExports,
		BucketArtifacts: cfg.S3BucketArtifacts,
	})
	if err != nil {
		log.Fatal("failed to connect to s3 storage", zap.Error(err))
	}

	log.Info("s3 connected")

	if err := storage.RunSmokeTest(ctx, s3Client); err != nil {
		log.Fatal("s3 smoke test failed", zap.Error(err))
	}

	log.Info("s3 smoke test ok")

	readinessChecker := health.NewCompositeChecker(
		health.NewPostgresChecker(postgres.Pool),
		health.NewRedisChecker(redisClient.Raw),
	)

	healthHandler := health.NewHandler(readinessChecker)

	asynqClient := jobs.NewAsynqClient(jobs.RedisConfig{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})
	defer asynqClient.Close()

	task, err := jobs.NewSystemPingTask("hello from api startup")
	if err != nil {
		log.Fatal("failed to create demo task", zap.Error(err))
	}

	info, err := asynqClient.Enqueue(task)
	if err != nil {
		log.Fatal("failed to enqueue demo task", zap.Error(err))
	}

	log.Info("demo task enqueued",
		zap.String("task_id", info.ID),
		zap.String("queue", info.Queue),
		zap.String("type", task.Type()),
	)

	server := httpserver.New(cfg.BackendPort, healthHandler)

	log.Info("starting backend",
		zap.String("env", cfg.AppEnv),
		zap.String("port", cfg.BackendPort),
	)

	if err := server.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal("server failed to start", zap.Error(err))
	}
}
