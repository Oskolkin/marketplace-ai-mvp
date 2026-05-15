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
	adminHandler *handlers.AdminHandler,
	accountHandler *handlers.AccountHandler,
	chatHandler *handlers.ChatHandler,
	analyticsDashboardHandler *handlers.AnalyticsDashboardHandler,
	pricingConstraintsHandler *handlers.PricingConstraintsHandler,
	alertsHandler *handlers.AlertsHandler,
	recommendationsHandler *handlers.RecommendationsHandler,
	ozonHandler *handlers.OzonHandler,
	ozonIngestionSyncHandler *handlers.OzonIngestionSyncHandler,
	ozonIngestionStatusHandler *handlers.OzonIngestionStatusHandler,
	authMiddleware func(http.Handler) http.Handler,
	sellerMiddleware func(http.Handler) http.Handler,
	adminMiddleware func(http.Handler) http.Handler,
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
		r.With(adminMiddleware).Get("/api/v1/admin/me", adminHandler.Me)
		r.With(adminMiddleware).Get("/api/v1/admin/clients", adminHandler.ListClients)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}", adminHandler.GetClientDetail)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/sync-jobs", adminHandler.ListSyncJobs)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/import-jobs", adminHandler.ListImportJobs)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/import-errors", adminHandler.ListImportErrors)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/sync-cursors", adminHandler.ListSyncCursors)
		r.With(adminMiddleware).Post("/api/v1/admin/clients/{seller_account_id}/actions/rerun-sync", adminHandler.RerunSync)
		r.With(adminMiddleware).Post("/api/v1/admin/clients/{seller_account_id}/actions/reset-cursor", adminHandler.ResetCursor)
		r.With(adminMiddleware).Post("/api/v1/admin/clients/{seller_account_id}/actions/rerun-metrics", adminHandler.RerunMetrics)
		r.With(adminMiddleware).Post("/api/v1/admin/clients/{seller_account_id}/actions/rerun-alerts", adminHandler.RerunAlerts)
		r.With(adminMiddleware).Post("/api/v1/admin/clients/{seller_account_id}/actions/rerun-recommendations", adminHandler.RerunRecommendations)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/ai/recommendation-runs", adminHandler.ListRecommendationRuns)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/ai/recommendation-runs/{run_id}", adminHandler.GetRecommendationRunDetail)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/ai/recommendations/{id}", adminHandler.GetRecommendationRawAI)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/ai/chat-traces", adminHandler.ListChatTraces)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/ai/chat-traces/{trace_id}", adminHandler.GetChatTraceDetail)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/chat/sessions", adminHandler.ListChatSessions)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/chat/sessions/{session_id}/messages", adminHandler.ListChatMessages)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/feedback/chat", adminHandler.ListChatFeedbackByClient)
		r.With(adminMiddleware).Get("/api/v1/admin/feedback/chat", adminHandler.ListAllChatFeedback)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/feedback/recommendations", adminHandler.ListRecommendationFeedbackByClient)
		r.With(adminMiddleware).Get("/api/v1/admin/clients/{seller_account_id}/billing", adminHandler.GetBillingStateByClient)
		r.With(adminMiddleware).Put("/api/v1/admin/clients/{seller_account_id}/billing", adminHandler.UpdateBillingStateByClient)
		r.With(adminMiddleware).Get("/api/v1/admin/billing", adminHandler.ListBillingStates)

		r.Group(func(r chi.Router) {
			r.Use(sellerMiddleware)

			r.Get("/api/v1/account", accountHandler.GetCurrentAccount)
			r.Post("/api/v1/chat/ask", chatHandler.Ask)
			r.Get("/api/v1/chat/sessions", chatHandler.ListSessions)
			r.Get("/api/v1/chat/sessions/{id}", chatHandler.GetSession)
			r.Get("/api/v1/chat/sessions/{id}/messages", chatHandler.ListSessionMessages)
			r.Post("/api/v1/chat/sessions/{id}/archive", chatHandler.ArchiveSession)
			r.Post("/api/v1/chat/messages/{id}/feedback", chatHandler.AddMessageFeedback)
			r.Get("/api/v1/analytics/dashboard", analyticsDashboardHandler.GetDashboardSummary)
			r.Get("/api/v1/analytics/sku-table", analyticsDashboardHandler.GetSKUTable)
			r.Get("/api/v1/analytics/stocks", analyticsDashboardHandler.GetStocksTable)
			r.Get("/api/v1/analytics/critical-skus", analyticsDashboardHandler.GetCriticalSKUs)
			r.Get("/api/v1/analytics/stocks-replenishment", analyticsDashboardHandler.GetStocksReplenishment)
			r.Get("/api/v1/analytics/advertising", analyticsDashboardHandler.GetAdvertisingAnalytics)
			r.Get("/api/v1/pricing-constraints", pricingConstraintsHandler.GetPricingConstraints)
			r.Put("/api/v1/pricing-constraints/global", pricingConstraintsHandler.PutGlobalDefault)
			r.Post("/api/v1/pricing-constraints/category-rules", pricingConstraintsHandler.PostCategoryRule)
			r.Post("/api/v1/pricing-constraints/category-rules/deactivate", pricingConstraintsHandler.PostDeactivateCategoryRule)
			r.Post("/api/v1/pricing-constraints/sku-overrides", pricingConstraintsHandler.PostSKUOverride)
			r.Post("/api/v1/pricing-constraints/sku-overrides/deactivate", pricingConstraintsHandler.PostDeactivateSKUOverride)
			r.Get("/api/v1/pricing-constraints/effective", pricingConstraintsHandler.GetEffectiveConstraints)
			r.Post("/api/v1/pricing-constraints/preview", pricingConstraintsHandler.PostPreview)
			r.Get("/api/v1/alerts", alertsHandler.GetAlerts)
			r.Get("/api/v1/alerts/summary", alertsHandler.GetSummary)
			r.Post("/api/v1/alerts/run", alertsHandler.RunAlerts)
			r.Post("/api/v1/alerts/{id}/dismiss", alertsHandler.DismissAlert)
			r.Post("/api/v1/alerts/{id}/resolve", alertsHandler.ResolveAlert)
			r.Get("/api/v1/recommendations", recommendationsHandler.ListRecommendations)
			r.Get("/api/v1/recommendations/summary", recommendationsHandler.GetSummary)
			r.Get("/api/v1/recommendations/{id}", recommendationsHandler.GetRecommendationByID)
			r.Post("/api/v1/recommendations/generate", recommendationsHandler.GenerateRecommendations)
			r.Post("/api/v1/recommendations/{id}/accept", recommendationsHandler.AcceptRecommendation)
			r.Post("/api/v1/recommendations/{id}/dismiss", recommendationsHandler.DismissRecommendation)
			r.Post("/api/v1/recommendations/{id}/resolve", recommendationsHandler.ResolveRecommendation)
			r.Post("/api/v1/recommendations/{id}/feedback", recommendationsHandler.AddFeedback)

			r.Route("/api/v1/integrations/ozon", func(r chi.Router) {
				r.Get("/", ozonHandler.GetConnection)
				r.Post("/", ozonHandler.CreateConnection)
				r.Put("/", ozonHandler.UpdateConnection)
				r.Put("/performance-token", ozonHandler.PutPerformanceToken)
				r.Post("/check", ozonHandler.CheckConnection)
				r.Post("/check-performance", ozonHandler.CheckPerformanceConnection)

				r.Post("/initial-sync", ozonIngestionSyncHandler.StartInitialSync)
				r.Get("/status", ozonIngestionStatusHandler.GetStatus)
			})
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
