package metrics

import "github.com/prometheus/client_golang/prometheus"

type Metrics struct {
	HTTPRequestTotal    *prometheus.CounterVec
	HTTPRequestDuration *prometheus.HistogramVec
	AppInfo             *prometheus.GaugeVec
	DBUp                prometheus.Gauge
	RedisUp             prometheus.Gauge
	S3Up                prometheus.Gauge
	JobsProcessedTotal  *prometheus.CounterVec
}

func New(registry *prometheus.Registry) *Metrics {
	m := &Metrics{
		HTTPRequestTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "http_requests_total",
				Help: "Total number of HTTP requests.",
			},
			[]string{"method", "path", "status"},
		),
		HTTPRequestDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "http_request_duration_seconds",
				Help:    "HTTP request latency in seconds.",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"method", "path", "status"},
		),
		AppInfo: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "app_info",
				Help: "Application info.",
			},
			[]string{"service", "env", "version"},
		),
		DBUp: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Name: "db_up",
				Help: "Database connectivity status.",
			},
		),
		RedisUp: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Name: "redis_up",
				Help: "Redis connectivity status.",
			},
		),
		S3Up: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Name: "s3_up",
				Help: "S3 connectivity status.",
			},
		),
		JobsProcessedTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "jobs_processed_total",
				Help: "Total number of processed jobs.",
			},
			[]string{"task_type", "queue", "status"},
		),
	}

	registry.MustRegister(
		m.HTTPRequestTotal,
		m.HTTPRequestDuration,
		m.AppInfo,
		m.DBUp,
		m.RedisUp,
		m.S3Up,
		m.JobsProcessedTotal,
	)

	return m
}
