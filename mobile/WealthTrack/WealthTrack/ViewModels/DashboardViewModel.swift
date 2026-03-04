import Foundation
import SwiftData
import Observation

@Observable
class DashboardViewModel {
    var holdings: [PortfolioHolding] = []
    var totalValue: Double = 0
    var breakdown: [AssetCategory: Double] = [:]
    var riskScore: RiskScore = RiskScore(value: 0, label: "No Assets")
    var projectionPreview: Projection?
    var isLoading = false
    var priceError: String?
    var currencyCode: String = "USD"

    func refresh(assets: [Asset], baseCurrency: String = "USD") async {
        currencyCode = baseCurrency
        guard !assets.isEmpty else { return }
        isLoading = true
        priceError = nil

        // Fetch prices from API
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: baseCurrency
            )

            let priceMap = Dictionary(uniqueKeysWithValues: prices.map { ($0.id, $0.price) })

            let missingPrices = assets.filter { priceMap[$0.symbol] == nil }
            if !missingPrices.isEmpty {
                let symbols = missingPrices.map(\.symbol).joined(separator: ", ")
                print("[WealthTrack] Missing prices for: \(symbols)")
                priceError = "Couldn't load prices. Pull down to retry."
            }

            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.currentAmount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            print("[WealthTrack] Price fetch failed: \(error)")
            priceError = "Couldn't load prices. Pull down to retry."
            // Use zero prices on error — user still sees their assets
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.currentAmount,
                    pricePerUnit: 0,
                    category: asset.assetCategory
                )
            }
        }

        totalValue = PortfolioCalculator.totalValue(holdings: holdings)
        breakdown = PortfolioCalculator.categoryBreakdown(holdings: holdings)
        riskScore = RiskCalculator.riskScore(holdings: holdings)
        projectionPreview = ProjectionEngine.project(holdings: holdings, years: 10)
        isLoading = false
    }
}
