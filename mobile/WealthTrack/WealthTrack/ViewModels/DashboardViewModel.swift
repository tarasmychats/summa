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

    func refresh(assets: [Asset]) async {
        isLoading = true

        // Fetch prices from API
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: "USD" // TODO: use UserSettings
            )

            let priceMap = Dictionary(uniqueKeysWithValues: prices.map { ($0.id, $0.price) })

            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.amount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            // Use zero prices on error — user still sees their assets
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.amount,
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
