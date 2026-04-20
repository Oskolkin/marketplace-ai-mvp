package adsync

import (
	"context"
)

type Service struct {
}

type RunInput struct {
	SellerAccountID int64
	ImportJobID     int64
	SourceCursor    string
}

type RunResult struct {
	RecordsReceived int32
	RecordsImported int32
	RecordsFailed   int32
	NextCursorValue string
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) Run(ctx context.Context, input RunInput) (RunResult, error) {
	return RunResult{
		RecordsReceived: 0,
		RecordsImported: 0,
		RecordsFailed:   0,
		NextCursorValue: "",
	}, nil
}
