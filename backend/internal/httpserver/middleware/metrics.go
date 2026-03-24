package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Oskolkin/marketplace-ai-mvp/backend/internal/metrics"
)

func Metrics(m *metrics.Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := newStatusResponseWriter(w)

			next.ServeHTTP(sw, r)

			duration := time.Since(start).Seconds()
			status := strconv.Itoa(sw.statusCode)

			m.HTTPRequestTotal.WithLabelValues(r.Method, r.URL.Path, status).Inc()
			m.HTTPRequestDuration.WithLabelValues(r.Method, r.URL.Path, status).Observe(duration)
		})
	}
}
