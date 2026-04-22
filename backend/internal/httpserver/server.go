package httpserver

import (
	"fmt"
	"net/http"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/health"
	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/httpserver/handlers"
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

func New(
	port string,
	healthHandler *health.Handler,
	authHandler *handlers.AuthHandler,
	accountHandler *handlers.AccountHandler,
	analyticsDashboardHandler *handlers.AnalyticsDashboardHandler,
	ozonHandler *handlers.OzonHandler,
	ozonIngestionSyncHandler *handlers.OzonIngestionSyncHandler,
	ozonIngestionStatusHandler *handlers.OzonIngestionStatusHandler,
	authMiddleware func(http.Handler) http.Handler,
	log *zap.Logger,
	m *metrics.Metrics,
	registry *prometheus.Registry,
) *Server {
	r := chi.NewRouter()

	r.Use(appmw.CORS("http://localhost:3000"))
	r.Use(appmw.RequestID)
	r.Use(appmw.Recovery(log))
	r.Use(appmw.Logging(log))
	r.Use(appmw.Metrics(m))

	r.Get("/health/live", healthHandler.Live)
	r.Get("/health/ready", healthHandler.Ready)
	r.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))

	r.Post("/api/v1/auth/register", authHandler.Register)
	r.Post("/api/v1/auth/login", authHandler.Login)

	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)

		r.Get("/api/v1/auth/me", authHandler.Me)
		r.Post("/api/v1/auth/logout", authHandler.Logout)

		r.Get("/api/v1/account", accountHandler.GetCurrentAccount)
		r.Get("/api/v1/analytics/dashboard", analyticsDashboardHandler.GetDashboardSummary)
		r.Get("/api/v1/analytics/sku-table", analyticsDashboardHandler.GetSKUTable)
		r.Get("/api/v1/analytics/stocks", analyticsDashboardHandler.GetStocksTable)
		r.Get("/api/v1/analytics/critical-skus", analyticsDashboardHandler.GetCriticalSKUs)
		r.Get("/api/v1/analytics/stocks-replenishment", analyticsDashboardHandler.GetStocksReplenishment)

		r.Route("/api/v1/integrations/ozon", func(r chi.Router) {
			r.Get("/", ozonHandler.GetConnection)
			r.Post("/", ozonHandler.CreateConnection)
			r.Put("/", ozonHandler.UpdateConnection)
			r.Post("/check", ozonHandler.CheckConnection)

			r.Post("/initial-sync", ozonIngestionSyncHandler.StartInitialSync)
			r.Get("/status", ozonIngestionStatusHandler.GetStatus)
		})
	})

	return &Server{
		httpServer: &http.Server{
			Addr:    fmt.Sprintf(":%s", port),
			Handler: r,
		},
	}
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}
