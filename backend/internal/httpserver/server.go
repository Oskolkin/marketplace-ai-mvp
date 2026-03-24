package httpserver

import (
	"fmt"
	"net/http"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/health"
	appmw "github.com/Oskolkin/marketplace-ai-mvp/backend/internal/httpserver/middleware"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/metrics"
	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

type Server struct {
	httpServer *http.Server
}

func New(port string, healthHandler *health.Handler, log *zap.Logger, m *metrics.Metrics, registry *prometheus.Registry) *Server {
	r := chi.NewRouter()

	r.Use(appmw.RequestID)
	r.Use(appmw.Logging(log))
	r.Use(appmw.Recovery(log))
	r.Use(appmw.Metrics(m))

	r.Get("/health/live", healthHandler.Live)
	r.Get("/health/ready", healthHandler.Ready)

	r.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))

	r.Get("/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"service":"backend","version":"dev"}`))
	})

	r.Get("/panic", func(w http.ResponseWriter, r *http.Request) {
		panic("test panic")
	})

	return &Server{
		httpServer: &http.Server{
			Addr:              fmt.Sprintf(":%s", port),
			Handler:           r,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}
