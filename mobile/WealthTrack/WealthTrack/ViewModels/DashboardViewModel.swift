import Foundation
import SwiftData
import Observation

@Observable
class DashboardViewModel {
    var holdings: [PortfolioHolding] = []
    var totalValue: Double = 0
    var previousValue: Double?
    var valueChange: ValueChange?
    var breakdown: [AssetCategory: Double] = [:]
    var riskScore: RiskScore = RiskScore(value: 0, label: "No Assets")
    var projectionPreview: Projection?
    var isLoading = false
    var priceError: String?
    var currencyCode: String = "USD"
    var lastUpdated: Date?

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    func refresh(assets: [Asset], baseCurrency: String = "USD") async {
        currencyCode = baseCurrency
        guard !assets.isEmpty else {
            holdings = []
            totalValue = 0
            previousValue = nil
            valueChange = nil
            breakdown = [:]
            riskScore = RiskScore(value: 0, label: "No Assets")
            projectionPreview = nil
            lastUpdated = nil
            isLoading = false
            return
        }
        isLoading = true
        priceError = nil

        // Fetch prices from API
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: baseCurrency
            )

            let priceMap = Dictionary(prices.map { ($0.id, $0.price) }, uniquingKeysWith: { _, last in last })

            lastUpdated = Date()

            let missingPrices = assets.filter { priceMap[$0.symbol] == nil }
            if !missingPrices.isEmpty {
                let symbols = missingPrices.map(\.symbol).joined(separator: ", ")
                print("[WealthTrack] Missing prices for: \(symbols)")
                priceError = PriceErrorMessage.partialFailureMessage
            }

            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    symbol: asset.symbol,
                    amount: asset.currentAmount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            print("[WealthTrack] Price fetch failed: \(error)")
            priceError = PriceErrorMessage.userMessage(from: error)
            // Use zero prices on error — user still sees their assets
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    symbol: asset.symbol,
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

        // Fetch recent history to compute previous day's value
        previousValue = await fetchPreviousValue(assets: assets, currency: baseCurrency)
        valueChange = PortfolioCalculator.valueChange(currentValue: totalValue, previousValue: previousValue)

        isLoading = false
    }

    /// Fetch the most recent prior day's portfolio value from history API
    private func fetchPreviousValue(assets: [Asset], currency: String) async -> Double? {
        let calendar = Calendar.current
        let today = Date()
        guard let sevenDaysAgo = calendar.date(byAdding: .day, value: -7, to: today) else { return nil }

        let assetParams = assets.map { (id: $0.symbol, category: $0.category) }

        do {
            let history = try await PriceAPIClient.shared.fetchHistory(
                assets: assetParams,
                from: sevenDaysAgo,
                to: today,
                currency: currency.lowercased()
            )

            // Compute daily totals, find the most recent day before today
            let todayString = Self.dateFormatter.string(from: today)

            // Collect all dates across all assets
            var allDates = Set<String>()
            for (_, points) in history {
                for point in points {
                    allDates.insert(point.date)
                }
            }

            // Sort dates and find the most recent one before today
            let sortedDates = allDates.sorted().filter { $0 < todayString }
            guard let previousDate = sortedDates.last else { return nil }

            // Compute portfolio total for that date
            var dayTotal = 0.0
            for asset in assets {
                let compositeKey = "\(asset.symbol):\(asset.category)"
                guard let assetHistory = history[compositeKey] else { continue }
                let priceMap = Dictionary(assetHistory.map { ($0.date, $0.price) }, uniquingKeysWith: { _, last in last })
                guard let price = priceMap[previousDate] else { continue }
                dayTotal += price * asset.currentAmount
            }

            return dayTotal > 0 ? dayTotal : nil
        } catch {
            print("[WealthTrack] History fetch for change indicator failed: \(error)")
            return nil
        }
    }
}
