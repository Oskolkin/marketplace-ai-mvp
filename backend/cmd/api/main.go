package main

import (
	"context"
	"errors"
	"net/http"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/config"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/db"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/health"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/httpserver"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/logger"
	"go.uber.org/zap"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	log, err := logger.New(cfg.AppEnv)
	if err != nil {
		panic(err)
	}
	defer log.Sync()

	log.Info("config loaded",
		zap.String("env", cfg.AppEnv),
		zap.String("port", cfg.BackendPort),
		zap.String("migrations_path", cfg.MigrationsPath),
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

	healthHandler := health.NewHandler(
		health.NewPostgresChecker(postgres.Pool),
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
