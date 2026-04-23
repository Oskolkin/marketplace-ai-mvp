// Package pricingconstraints contains domain formulas and validation primitives
// for pricing constraints.
//
// Margin semantics are fixed across this package:
//   - margin = (price - cost) / price
//   - margin is stored and passed as decimal fraction (0.25, not "25%").
package pricingconstraints
