package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/config"
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

	log.Info("starting backend",
		zap.String("env", cfg.AppEnv),
		zap.String("port", cfg.BackendPort),
	)

	server := httpserver.New(cfg.BackendPort)

	// Запуск сервера в goroutine
	go func() {
		if err := server.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("server failed to start", zap.Error(err))
		}
	}()

	// Ожидание сигнала остановки
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	<-stop
	log.Info("shutting down server...")

	// graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// пока без Shutdown метода — добавим дальше
	_ = ctx

	log.Info("server stopped")
}
