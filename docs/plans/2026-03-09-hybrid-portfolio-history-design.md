# Hybrid Portfolio History

## Problem

New portfolios show flat/zero charts because `amountAtDate()` returns 0 for dates before the first transaction. Users expect to see how their current portfolio would have performed historically.

## Solution

Change `amountAtDate()` fallback: instead of returning 0 when no transactions exist before a date, return `fallbackAmount` (the asset's current amount). This projects current holdings backwards in time until real transactions take over.

## Behavior

- **No transactions**: uses `currentAmount` for all dates
- **Transactions exist**: uses `currentAmount` before the earliest transaction, then replays transactions after
- **Applies to**: portfolio chart (all 5 time ranges) and daily value change indicator

## Change

Single line in `PortfolioCalculator.amountAtDate()`: return `fallbackAmount` instead of `0.0` when no transactions precede the given date. The `fallbackAmount` parameter was already passed through but ignored in this case.
