package httpserver

import (
	"fmt"
	"net/http"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/health"
	"github.com/go-chi/chi/v5"
)

type Server struct {
	httpServer *http.Server
}

func New(port string) *Server {
	r := chi.NewRouter()

	r.Get("/health/live", health.Live)
	r.Get("/health/ready", health.Ready)

	r.Get("/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"service":"backend","version":"dev"}`))
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
