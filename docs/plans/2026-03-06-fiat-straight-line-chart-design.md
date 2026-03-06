# Straight Line Chart for Fiat Matching Display Currency

## Problem

When the portfolio contains only fiat assets matching the display currency (e.g., USD cash with USD display), the chart either shows no data or makes an unnecessary API call. The price is always 1.0, so the value equals the amount.

## Design

In `PortfolioChartView.loadHistory()`, before calling `PriceAPIClient`, check if all assets are fiat and their category currency matches the display currency.

If so, skip the API call and generate synthetic data points locally:

1. Build a date array for each day in the selected time range
2. For each day, compute the total amount across all matching assets using `PortfolioCalculator.amountAtDate()` (respects transaction history)
3. Portfolio value = amount (price is 1.0)

This produces a straight line if the amount hasn't changed, or steps up/down at transaction dates.

## Scope

- Applies only when ALL assets are fiat matching display currency
- Mixed portfolios (fiat + stocks/crypto) use the normal API path
- Fiat not matching display currency (e.g., EUR cash with USD display) uses the normal API path
