package jobs

import "github.com/hibiken/asynq"

func NewServeMux(handler *Handler) *asynq.ServeMux {
	mux := asynq.NewServeMux()
	mux.HandleFunc(TypeSystemPing, handler.HandleSystemPingTask)
	return mux
}
