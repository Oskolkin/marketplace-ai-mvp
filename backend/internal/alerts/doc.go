// Package alerts contains the domain foundation for Stage 7 Alerts Engine.
//
// The package is rule-based and evidence-based:
// future rules produce normalized RuleResult values, which are persisted as
// idempotent alerts via fingerprint and accompanied by structured evidence.
//
// This package is not a Recommendation Engine and does not include API/UI/jobs.
package alerts
